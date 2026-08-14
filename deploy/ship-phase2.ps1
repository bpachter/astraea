# Astraea — AWS Phase 2 ship (docs/DEPLOYMENT.md).
#
# Operator prerequisites (the only manual steps):
#   1. AWS account + an IAM identity with deploy permissions
#   2. `aws configure` completed locally (access key, secret, region)
#   3. Docker running (images are pulled from ghcr, not built here)
#
# Everything else is this script, top to bottom. Re-runnable: existing
# repositories and roles are reused, and services already present are updated
# instead of recreated. Nothing here stores or echoes credentials.

param(
  # Ohio — matches the account's console default. App Runner is available here.
  [string]$Region = "us-east-2",
  [string]$App = "astraea",
  [string]$GhcrOwner = "bpachter",
  # Skip the ghcr pull when the images are already tagged locally.
  [switch]$SkipPull,
  # PyPI-installed CLI (the build machine cannot reach Amazon's MSI CDN).
  # Swap for plain "aws" if the v2 installer is available. The local venv
  # predates the Astraea rename and keeps its old directory name.
  [string]$Aws = "C:\dev\venvs\themis\Scripts\python.exe C:\dev\venvs\themis\Scripts\aws"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent

function Invoke-Aws { param([string]$Cmd) Invoke-Expression "$Aws $Cmd" }
function Write-Step { param([string]$Text) Write-Host "`n=== $Text" -ForegroundColor Cyan }

# Existence probes are exit-code driven, not exception driven: whether a failing
# native command throws depends on the PowerShell version, and a swallowed
# "does not exist" would skip creation and fail later with a confusing error.
function Test-AwsOk { param([string]$Cmd)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { Invoke-Expression "$Aws $Cmd" 2>&1 | Out-Null; return ($LASTEXITCODE -eq 0) }
  catch { return $false }
  finally { $ErrorActionPreference = $prev }
}

# ---- 0. Identity -----------------------------------------------------------
Write-Step "Identity"
$account = (Invoke-Aws "sts get-caller-identity --query Account --output text").Trim()
$registry = "$account.dkr.ecr.$Region.amazonaws.com"
Write-Host "account $account · region $Region · registry $registry"

# ---- 1. Images: ghcr -> ECR ------------------------------------------------
Write-Step "Images"
foreach ($svc in "gate", "portal") {
  if (-not (Test-AwsOk "ecr describe-repositories --repository-names $App-$svc --region $Region")) {
    Invoke-Aws "ecr create-repository --repository-name $App-$svc --region $Region" | Out-Null
    Write-Host "created ECR repository $App-$svc"
  } else { Write-Host "ECR repository $App-$svc already present" }
}
Invoke-Aws "ecr get-login-password --region $Region" | docker login --username AWS --password-stdin $registry
if (-not $SkipPull) {
  foreach ($svc in "gate", "portal") {
    docker pull "ghcr.io/$GhcrOwner/$App-${svc}:latest"
    if ($LASTEXITCODE -ne 0) { throw "ghcr pull failed for $App-$svc — is the CI build green?" }
    docker tag "ghcr.io/$GhcrOwner/$App-${svc}:latest" "$App-$svc"
  }
}
foreach ($svc in "gate", "portal") {
  docker tag "$App-$svc" "$registry/$App-${svc}:latest"
  docker push "$registry/$App-${svc}:latest"
  if ($LASTEXITCODE -ne 0) { throw "ECR push failed for $App-$svc" }
}

# ---- 2. App Runner ECR access role ----------------------------------------
Write-Step "IAM"
$roleName = "$App-apprunner-ecr-access"
$trust = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
if (Test-AwsOk "iam get-role --role-name $roleName") {
  Write-Host "role $roleName already present"
} else {
  $trustFile = New-TemporaryFile
  $trust | Set-Content $trustFile -Encoding ascii
  Invoke-Aws "iam create-role --role-name $roleName --assume-role-policy-document file://$($trustFile.FullName)" | Out-Null
  Invoke-Aws "iam attach-role-policy --role-name $roleName --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess" | Out-Null
  Write-Host "created role $roleName; waiting for IAM propagation"
  Start-Sleep 15
}
$roleArn = (Invoke-Aws "iam get-role --role-name $roleName --query Role.Arn --output text").Trim()

# ---- helpers ---------------------------------------------------------------
function Get-Service { param([string]$Name)
  $json = Invoke-Aws "apprunner list-services --region $Region --output json"
  ($json | ConvertFrom-Json).ServiceSummaryList | Where-Object { $_.ServiceName -eq $Name }
}

function Write-JsonArg { param($Object)
  $file = New-TemporaryFile
  ($Object | ConvertTo-Json -Depth 8) | Set-Content $file -Encoding ascii
  return $file.FullName
}

function New-SourceConfig { param([string]$Image, [int]$Port, [hashtable]$Env)
  Write-JsonArg @{
    AuthenticationConfiguration = @{ AccessRoleArn = $roleArn }
    AutoDeploymentsEnabled      = $false
    ImageRepository             = @{
      ImageIdentifier     = $Image
      ImageRepositoryType = "ECR"
      ImageConfiguration  = @{ Port = "$Port"; RuntimeEnvironmentVariables = $Env }
    }
  }
}

# Values like "0.25 vCPU" and "0.5 GB" contain spaces, which CLI shorthand
# (Cpu=...,Memory=...) cannot survive once the command line is expanded.
# Every structured argument goes in as JSON for exactly this reason.
$instanceConfigFile = Write-JsonArg @{ Cpu = "0.25 vCPU"; Memory = "0.5 GB" }

function Wait-Service { param([string]$Name)
  while ($true) {
    Start-Sleep 20
    $svc = Get-Service $Name
    if (-not $svc) { throw "service $Name vanished" }
    Write-Host "  $Name : $($svc.Status)"
    if ($svc.Status -eq "RUNNING") { return $svc }
    if ($svc.Status -like "*FAILED*" -or $svc.Status -eq "DELETED") {
      throw "service $Name entered $($svc.Status) — check the App Runner console logs"
    }
  }
}

function Deploy-Service { param([string]$Name, [string]$Image, [int]$Port, [string]$HealthPath, [hashtable]$Env)
  $cfgFile = New-SourceConfig -Image $Image -Port $Port -Env $Env
  $existing = Get-Service $Name
  if ($existing) {
    Write-Host "updating $Name"
    Invoke-Aws ("apprunner update-service --region $Region --service-arn $($existing.ServiceArn) " +
      "--source-configuration file://$cfgFile") | Out-Null
  } else {
    Write-Host "creating $Name"
    Invoke-Aws ("apprunner create-service --service-name $Name --region $Region " +
      "--source-configuration file://$cfgFile " +
      "--instance-configuration file://$instanceConfigFile " +
      "--health-check-configuration Protocol=HTTP,Path=$HealthPath,Interval=10,Timeout=5,HealthyThreshold=1,UnhealthyThreshold=5") | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "create-service failed for $Name (see the CLI error above)" }
  }
  return Wait-Service $Name
}

# ---- 3. Gate ---------------------------------------------------------------
Write-Step "Gate service"
$gate = Deploy-Service -Name "$App-gate" -Image "$registry/$App-gate:latest" -Port 8080 `
  -HealthPath "/healthz" -Env @{ AtlasDir = "/app/atlas" }
$gateUrl = "https://$($gate.ServiceUrl)"
Write-Host "gate: $gateUrl"

# ---- 4. Portal, wired to the gate -----------------------------------------
Write-Step "Portal service"
$secret = -join ((1..50) | ForEach-Object { [char](Get-Random -InputObject (48..57 + 65..90 + 97..122)) })
$portalEnv = @{
  ASTRAEA_GATE_URL  = $gateUrl
  DJANGO_DEBUG      = "0"
  DJANGO_SECRET_KEY = $secret
}
$portal = Deploy-Service -Name "$App-portal" -Image "$registry/$App-portal:latest" -Port 8000 `
  -HealthPath "/admin/login/" -Env $portalEnv
$portalUrl = "https://$($portal.ServiceUrl)"
Write-Host "portal: $portalUrl"

# Now that both hostnames exist, close the loop: the portal trusts its own
# public host, and the gate allows the portal's origin for CORS.
Write-Step "Cross-wiring hostnames"
$portalEnv["DJANGO_ALLOWED_HOSTS"] = $portal.ServiceUrl
$portalEnv["DJANGO_CSRF_TRUSTED_ORIGINS"] = $portalUrl
$null = Deploy-Service -Name "$App-portal" -Image "$registry/$App-portal:latest" -Port 8000 `
  -HealthPath "/admin/login/" -Env $portalEnv
# The portal calls the gate server-side, but the published static app calls it
# from the browser — so the GitHub Pages origin must be trusted too, or the
# START view's live status probe is blocked by CORS.
$gateOrigins = "$portalUrl;https://bpachter.github.io"
$null = Deploy-Service -Name "$App-gate" -Image "$registry/$App-gate:latest" -Port 8080 `
  -HealthPath "/healthz" -Env @{ AtlasDir = "/app/atlas"; PortalOrigins = $gateOrigins }

# ---- 5. Recon static site --------------------------------------------------
Write-Step "Recon static site"
$bucket = "$App-recon-$account"
if (-not (Test-AwsOk "s3api head-bucket --bucket $bucket")) {
  Invoke-Aws "s3 mb s3://$bucket --region $Region" | Out-Null
  Write-Host "created bucket $bucket"
}
npm --prefix "$repoRoot\recon" run build
Invoke-Aws "s3 sync `"$repoRoot\recon\dist`" s3://$bucket --delete"
Write-Host "CloudFront: create a distribution with origin $bucket (OAC), default root index.html —"
Write-Host "left as a follow-up so the domain/cert story is chosen first."

Write-Step "SHIPPED"
Write-Host "gate   : $gateUrl/healthz"
Write-Host "lookup : $gateUrl/lookup"
Write-Host "portal : $portalUrl/admin/  (demo / astraea-demo)"
Write-Host "bucket : s3://$bucket"

# Themis — AWS Phase 2 ship (docs/DEPLOYMENT.md).
#
# Operator prerequisites (the only manual steps):
#   1. AWS account + IAM identity with admin (or ECR/AppRunner/S3/CloudFront/IAM) access
#   2. `aws configure` completed locally (access key, secret, region)
#   3. Docker running; images available locally or pullable from ghcr.io
#
# Everything else is this script, top to bottom. Idempotent where AWS allows;
# each step prints what it did. Nothing here stores or echoes credentials.

param(
  [string]$Region = "us-east-1",
  [string]$App = "themis",
  # PyPI-installed CLI (see repo history: the machine that authored this could
  # not reach Amazon's MSI CDN). Swap for plain "aws" with the v2 installer.
  [string]$Aws = "C:\dev\venvs\themis\Scripts\python.exe C:\dev\venvs\themis\Scripts\aws"
)

$ErrorActionPreference = "Stop"
function Invoke-Aws { param([string]$Cmd) Invoke-Expression "$Aws $Cmd" }

$account = (Invoke-Aws "sts get-caller-identity --query Account --output text").Trim()
Write-Host "Account $account, region $Region"
$registry = "$account.dkr.ecr.$Region.amazonaws.com"

# ---- 1. ECR repositories + images -----------------------------------------
foreach ($svc in "gate", "portal") {
  try { Invoke-Aws "ecr describe-repositories --repository-names $App-$svc --region $Region" | Out-Null }
  catch { Invoke-Aws "ecr create-repository --repository-name $App-$svc --region $Region" | Out-Null }
}
Invoke-Aws "ecr get-login-password --region $Region" | docker login --username AWS --password-stdin $registry
foreach ($svc in "gate", "portal") {
  docker tag "themis-$svc" "$registry/$App-${svc}:latest"
  docker push "$registry/$App-${svc}:latest"
}

# ---- 2. App Runner ECR access role ----------------------------------------
$roleName = "$App-apprunner-ecr-access"
$trust = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
try { Invoke-Aws "iam get-role --role-name $roleName" | Out-Null }
catch {
  Invoke-Aws "iam create-role --role-name $roleName --assume-role-policy-document '$trust'" | Out-Null
  Invoke-Aws "iam attach-role-policy --role-name $roleName --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess" | Out-Null
  Start-Sleep 10  # IAM propagation
}
$roleArn = (Invoke-Aws "iam get-role --role-name $roleName --query Role.Arn --output text").Trim()

# ---- 3. Gate service -------------------------------------------------------
function New-AppRunnerService {
  param([string]$Name, [string]$Image, [hashtable]$Env, [string]$HealthPath, [int]$Port)
  $envJson = ($Env.GetEnumerator() | ForEach-Object { "`"$($_.Key)`":`"$($_.Value)`"" }) -join ","
  $src = @{
    AuthenticationConfiguration = @{ AccessRoleArn = $roleArn }
    ImageRepository = @{
      ImageIdentifier = $Image
      ImageRepositoryType = "ECR"
      ImageConfiguration = @{ Port = "$Port"; RuntimeEnvironmentVariables = ($Env) }
    }
  } | ConvertTo-Json -Depth 6 -Compress
  $cfgFile = New-TemporaryFile
  $src | Set-Content $cfgFile -Encoding utf8
  Invoke-Aws ("apprunner create-service --service-name $Name --region $Region " +
    "--source-configuration file://$($cfgFile.FullName) " +
    "--instance-configuration Cpu='0.25 vCPU',Memory='0.5 GB' " +
    "--health-check-configuration Protocol=HTTP,Path=$HealthPath")
}

New-AppRunnerService -Name "$App-gate" -Image "$registry/$App-gate:latest" -Port 8080 `
  -HealthPath "/healthz" -Env @{}
Write-Host "Waiting for gate service..." ; do { Start-Sleep 20
  $gate = (Invoke-Aws "apprunner list-services --region $Region --query `"ServiceSummaryList[?ServiceName=='$App-gate']|[0]`"" | ConvertFrom-Json)
} while ($gate.Status -eq "OPERATION_IN_PROGRESS")
$gateUrl = "https://$($gate.ServiceUrl)"
Write-Host "gate: $gateUrl"

# ---- 4. Portal service, wired to the gate ---------------------------------
$secret = -join ((1..50) | ForEach-Object { [char](Get-Random -InputObject (33..126)) })
New-AppRunnerService -Name "$App-portal" -Image "$registry/$App-portal:latest" -Port 8000 `
  -HealthPath "/admin/login/" -Env @{
    THEMIS_GATE_URL = $gateUrl
    DJANGO_DEBUG = "0"
    DJANGO_SECRET_KEY = $secret
  }
do { Start-Sleep 20
  $portal = (Invoke-Aws "apprunner list-services --region $Region --query `"ServiceSummaryList[?ServiceName=='$App-portal']|[0]`"" | ConvertFrom-Json)
} while ($portal.Status -eq "OPERATION_IN_PROGRESS")
$portalUrl = "https://$($portal.ServiceUrl)"
Write-Host "portal: $portalUrl"

# Portal knows its public hostname; gate allows the portal origin for CORS.
Invoke-Aws ("apprunner update-service --region $Region --service-arn $($portal.ServiceArn) " +
  "--source-configuration ImageRepository={ImageIdentifier=$registry/$App-portal:latest,ImageRepositoryType=ECR,ImageConfiguration={Port='8000',RuntimeEnvironmentVariables={THEMIS_GATE_URL=$gateUrl,DJANGO_DEBUG='0',DJANGO_SECRET_KEY=$secret,DJANGO_ALLOWED_HOSTS=$($portal.ServiceUrl),DJANGO_CSRF_TRUSTED_ORIGINS=$portalUrl}}}")
Invoke-Aws ("apprunner update-service --region $Region --service-arn $($gate.ServiceArn) " +
  "--source-configuration ImageRepository={ImageIdentifier=$registry/$App-gate:latest,ImageRepositoryType=ECR,ImageConfiguration={Port='8080',RuntimeEnvironmentVariables={PortalOrigins=$portalUrl}}}")

# ---- 5. Recon static site --------------------------------------------------
$bucket = "$App-recon-$account"
try { Invoke-Aws "s3api head-bucket --bucket $bucket" | Out-Null }
catch { Invoke-Aws "s3 mb s3://$bucket --region $Region" | Out-Null }
npm --prefix ..\recon run build
Invoke-Aws "s3 sync ..\recon\dist s3://$bucket --delete"
Write-Host "CloudFront: create a distribution with origin $bucket (OAC), default root index.html —"
Write-Host "left as a follow-up step so the operator chooses the domain/cert story first."

Write-Host "`nSHIPPED. gate=$gateUrl portal=$portalUrl s3=s3://$bucket"
Write-Host "Smoke: curl $gateUrl/healthz ; open $portalUrl/admin/ (demo / themis-demo)"

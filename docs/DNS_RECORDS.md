# DNS records to add in Cloudflare (zone: thessa.space)

**Set every record to "DNS only" (grey cloud), not Proxied.** Cloudflare
defaults new records to Proxied; a proxied record breaks AWS certificate
validation outright, and proxying in front of App Runner's own TLS causes
redirect loops unless the zone's SSL mode is Full (strict). The five
validation records must stay DNS-only permanently; the three app
subdomains can be switched to Proxied later if you want Cloudflare's CDN
in front.

Names below are already in Cloudflare's short form — it appends
`.thessa.space` for you. Every record is type **CNAME**, TTL **Auto**.

## 1. Certificate validation — 5 records

| # | name | target |
|---|---|---|
| 1 | `_1808b2c3c64adc79427b20a68e0894d2.astraea` | `_646c68def4c10359e7a434b530199b94.jkddzztszm.acm-validations.aws` |
| | `_9e218172879b4d97cf7572f4794dec37.gate` | `_955f399b6984d035d3e7f35a1f847cb4.jkddzztszm.acm-validations.aws` |
| | `_0677c7cf67425905a4994893f98cf072.e9rzjo29aoca0p9z0bc9k146ubdkrn5.gate` | `_856ba9e8b6dd4e2711dc24160d6e26c5.jkddzztszm.acm-validations.aws` |
| | `_830dcac043a5f0ff80fe75a1ede127ee.portal` | `_d90192afe32cbc0a6b8e37b44840bd07.jkddzztszm.acm-validations.aws` |
| | `_d9ab89b0cbf297b380c657e237ebc2b6.l3apfh4e13u1942arb8izbds7y3b9zq.portal` | `_2cdb67c6214e53dea77f850e48a0dd56.jkddzztszm.acm-validations.aws` |

## 2. The subdomains themselves — 3 records

| name | target | serves |
|---|---|---|
| `astraea` | `d2ff2qmnyf4i32.cloudfront.net` | the recon app (CloudFront over S3) |
| `gate` | `wmc38pwmtw.us-east-2.awsapprunner.com` | the .NET gate + lookup API |
| `portal` | `zsc9c6t7g3.us-east-2.awsapprunner.com` | the Django adjudication portal |

## 3. Then

Validation is usually minutes. App Runner starts serving `gate` and
`portal` by itself; CloudFront needs the alias attached once:

```bash
npx cdk deploy AstraeaPlatform -c appDomain=astraea.thessa.space
```

# DNS records to add in Cloudflare (zone: thessa.space)

Add every record with the proxy **OFF** (grey cloud / "DNS only").
A proxied record breaks certificate validation, and proxying in front of
App Runner's own TLS causes redirect loops unless Cloudflare SSL is
"Full (strict)". Once everything is issued and serving, the two app
subdomains can be switched to proxied if you want Cloudflare's CDN in
front — the validation records must stay DNS-only forever.

Cloudflare appends the zone automatically, so paste the name without the
trailing dot; if it complains about a duplicate suffix, drop the
".thessa.space" from the end of the name.

## 1. Certificate validation (5 records, type CNAME)

| name | value |
|---|---|
| `_1808b2c3c64adc79427b20a68e0894d2.astraea.thessa.space` | `_646c68def4c10359e7a434b530199b94.jkddzztszm.acm-validations.aws` |
| `_9e218172879b4d97cf7572f4794dec37.gate.thessa.space` | `_955f399b6984d035d3e7f35a1f847cb4.jkddzztszm.acm-validations.aws` |
| `_0677c7cf67425905a4994893f98cf072.e9rzjo29aoca0p9z0bc9k146ubdkrn5.gate.thessa.space` | `_856ba9e8b6dd4e2711dc24160d6e26c5.jkddzztszm.acm-validations.aws` |
| `_830dcac043a5f0ff80fe75a1ede127ee.portal.thessa.space` | `_d90192afe32cbc0a6b8e37b44840bd07.jkddzztszm.acm-validations.aws` |
| `_d9ab89b0cbf297b380c657e237ebc2b6.l3apfh4e13u1942arb8izbds7y3b9zq.portal.thessa.space` | `_2cdb67c6214e53dea77f850e48a0dd56.jkddzztszm.acm-validations.aws` |

## 2. The subdomains themselves (3 records, type CNAME)

| name | value | serves |
|---|---|---|
| `astraea` | `d2ff2qmnyf4i32.cloudfront.net` | the recon app (CloudFront over S3) |
| `gate` | `wmc38pwmtw.us-east-2.awsapprunner.com` | the .NET reconciliation gate + lookup API |
| `portal` | `zsc9c6t7g3.us-east-2.awsapprunner.com` | the Django adjudication portal |

## After the records are in

Validation is usually minutes. Then:

```bash
aws acm describe-certificate --certificate-arn arn:aws:acm:us-east-1:793140950071:certificate/4a6e7e56-d5ff-434c-bd9f-7bc3c45066c2 --region us-east-1 --query Certificate.Status
aws apprunner describe-custom-domains --service-arn <arn> --region us-east-2 --query 'CustomDomains[].Status'
```

App Runner manages its own certificates and starts serving the domain as
soon as validation passes. CloudFront needs one more step — attaching the
validated certificate and the alias to the distribution — which is a
one-line change in `flywheel/lib/platform-stack.ts` and a `cdk deploy`.

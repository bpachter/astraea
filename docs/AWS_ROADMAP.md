# Where the AWS architecture goes next

> **Status.** Stages 1, 2, 3 and 6 are shipped; Stage 4 is shipped except
> X-Ray. No domain purchase was needed — the services live under the existing
> `thessa.space` zone (Cloudflare DNS), which is also the honest place for
> them: Astraea is the governance layer extracted from Thessa. Stages 5 and 7 remain product
> decisions. Live: CDN `https://astraea.thessa.space`, dashboards
> `astraea-platform` and `astraea-flywheel`, stacks `AstraeaServices`,
> `AstraeaPlatform`, `AstraeaFlywheel`.

What exists today is deliberately small: two containers, a bucket, and a
pipeline that deploys them. This is the honest ordering of what to build next —
each stage names *what problem it solves*, *what changes in this repo*, and
*what it costs*. Nothing here is on the list merely because AWS sells it.

Today's stack is described in [AWS_STACK.md](AWS_STACK.md); the two shipped
phases are in [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Stage 1 — Close the gaps the review found ✅ SHIPPED

**Secrets out of service configuration.** `DJANGO_SECRET_KEY` is currently a
plain `RuntimeEnvironmentVariable`, so anyone who can call
`apprunner:DescribeService` reads it — Django signs sessions and CSRF tokens
with that value. Move it to **Secrets Manager** and reference it through App
Runner's `RuntimeEnvironmentSecrets`, which stores an ARN instead of a value.
Requires an App Runner *instance* role (distinct from the ECR access role) with
`secretsmanager:GetSecretValue` on that one secret. Rotate the existing key in
the same change. *Cost: $0.40/secret/month.*

**A budget that shouts.** AWS Budgets with a $15/month threshold and an email
action. Two minutes, and the only real protection against a surprise. *Free.*

**Log retention.** App Runner's CloudWatch log groups default to *never
expire*. Set 14 days. *Saves money rather than costing it.*

---

## Stage 2 — Infrastructure as code ✅ SHIPPED

`deploy/ship-phase2.ps1` is a good script and the wrong long-term artifact: it
describes *steps*, not *state*, so it cannot tell you what drifted, cannot be
reviewed as a diff, and cannot be torn down and rebuilt identically.

**How it went.** The two App Runner services were *imported* rather than
recreated: `cdk import` adopts a running resource into CloudFormation without
touching it, and `cdk diff` returning zero resource changes afterwards is the
proof the definition matches reality. That mattered here — their generated
hostnames are baked into the published portfolio, the walkthrough recording,
and each other's CORS configuration, so a replacement would have broken all
three. Both carry `RETAIN`, so `cdk destroy` cannot delete a live service. CI
now synthesizes every stack on each push, so broken IaC fails before it merges.

Replace it with **AWS CDK in TypeScript** — chosen over Terraform because this
repo is already TypeScript, and over CloudFormation YAML because the two
App Runner services are near-identical and deserve a loop rather than
copy-paste. The stack declares: two ECR repositories, two App Runner services
with their env wiring, the S3 bucket with versioning, both OIDC roles with
their scoped policies, and the CloudWatch alarms from Stage 4.

Then `cdk diff` in CI on every pull request becomes a genuine review artifact:
*this deploy changes the portal's memory from 0.5 GB to 1 GB and nothing else.*
That sentence is the whole argument for IaC, and it is the single most
resume-legible item on this list.

*Cost: nothing. CDK synthesizes CloudFormation, which is free.*

---

## Stage 3 — A real front door ✅ SHIPPED

**CloudFront + ACM + Route 53.** Today the static app is on GitHub Pages and
the services answer on generated `*.awsapprunner.com` hostnames. One
distribution with an ACM certificate gives `astraea.<domain>` for the app and
`api.astraea.<domain>` for the gate, with the 14 MB atlas cached at edge
locations instead of fetched from Ohio every time.

Worth doing for a second reason: a CloudFront distribution is the natural place
to attach **AWS WAF** later (rate limiting, geo rules, managed rule sets), and
the only way to put a custom domain in front of App Runner.

*Cost: ~$12/year for the domain, ~$0.50/month for the hosted zone, CloudFront
free tier covers this traffic. ACM certificates are free.*

---

## Stage 4 — Observability worth the name ◐ dashboards and alarms shipped, X-Ray pending

Right now, "is it healthy?" is answered by curling `/healthz` by hand.

- **CloudWatch alarms** on App Runner's `5xx`, `RequestLatency` p99, and
  `ActiveInstances == 0`, wired to an SNS topic that emails you. The gate
  answering 500s at 3am should not wait for a recruiter to discover it.
- **A dashboard** with request rate, latency, and error rate per service —
  one screenshot that says "this person operates systems".
- **AWS X-Ray** across the portal → gate hop. That call is currently a black
  box: X-Ray turns it into a trace with the reconciliation call as a segment,
  which is exactly the distributed-tracing story the two services exist to
  tell.
- **Structured logs.** Both services log human-readable lines today. JSON with
  a request id makes CloudWatch Logs Insights queryable —
  `fields @timestamp, verdict | filter verdict != "publishable"` is a real
  operational question about a governance system.

---

## Stage 5 — Persistence that survives a deploy (a week, ~$15–45/month)

The portal bakes seeded SQLite into its image and resets on every deploy —
correct for a public demo, wrong for anything real. **Aurora Serverless v2
PostgreSQL** (scales to 0.5 ACU when idle) or plain **RDS Postgres t4g.micro**
replaces it. Django's `DATABASES` is already environment-driven, so the code
change is one settings block plus a migration job in the pipeline.

This is the stage that requires deciding whether Astraea is a demo or a
product — it is the first item on this list with a real monthly cost and real
operational obligations (backups, parameter groups, a VPC, connection limits).
Do not do it to look impressive. Do it when there is state worth keeping.

---

## Stage 6 — The extraction flywheel, cloud-native ✅ SHIPPED

This is the interesting one, and the one that most resembles what a
metabolomics or life-sciences data platform actually runs.

Today the AI extraction flywheel runs on a workstation with a local GPU:
agents propose facts, an adjudicator checks citations, and the gate refuses
what does not reconcile. The cloud-native form of exactly that loop:

```
EventBridge (schedule) ──> Lambda: enumerate filings to extract
                              │
                              ▼
                        SQS work queue ──> Lambda: extract with Bedrock
                              │                     │
                        (DLQ after 3 tries)         ▼
                                              SQS verdict queue
                                                    │
                                                    ▼
                                    Fargate task: call the gate, write
                                    adjudication rows, emit metrics
```

Every piece of vocabulary from the profile snippets you are benchmarking
against appears here honestly: **SQS** for work distribution, **dead-letter
queues** for poison messages, **idempotency keys** so an at-least-once delivery
cannot double-write a fact, **Step Functions** if the extraction becomes a
multi-step saga with compensations, and **Bedrock** for the model calls so no
API key lives in the pipeline.

The governance thesis survives the move intact — and that is the point. Nothing
in this diagram publishes anything; it only fills the queue the human
adjudicates. *"AI proposes, code verifies, humans publish"* is the same
sentence whether the proposer is an RTX 4090 in a spare room or a fleet of
Lambdas.

---

## Stage 7 — The data layer (weeks, ~$5/month)

The atlas is 14 MB of JSON served as static files, which is right for 147
subsystems and wrong for the full knowledge graph.

- **S3 as a data lake** with the extraction output in **Parquet**, partitioned
  by source and date.
- **Glue Data Catalog + Athena** to query it with SQL, without a database to
  operate. `SELECT verdict, count(*) FROM adjudications WHERE dt > ...` for
  free, on demand.
- **DynamoDB** for the adjudication queue if it ever outgrows Postgres — the
  access pattern (get by id, list by status, append verdict) is a textbook
  single-table design, and its partition key would be the status.

---

## What to skip, and why

- **EKS / Kubernetes.** Two stateless services do not earn a cluster. Being
  able to explain *why not* is worth more than the vocabulary.
- **API Gateway in front of App Runner.** App Runner already terminates TLS,
  scales, and health-checks. Add it only when you need per-key throttling or
  usage plans.
- **Multi-region.** A portfolio demo with one user in Ohio does not need
  Frankfurt. CloudFront already puts the static half at the edge.
- **Cognito**, until there are real users. The demo login is a feature: it
  invites people in rather than keeping them out.

---

## Suggested order

Stage 1 (correctness and cost safety), then Stage 2 (IaC — the biggest
credibility gain per hour), then Stage 3 (the front door people actually see),
then Stage 4 (observability). Stages 5–7 are product decisions, not
infrastructure ones: build them when the system needs them, not when a résumé
does.

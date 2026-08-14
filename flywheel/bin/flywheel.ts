#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { FlywheelStack } from "../lib/flywheel-stack";
import { PlatformStack } from "../lib/platform-stack";
import { ServicesStack } from "../lib/services-stack";

const app = new cdk.App();

new FlywheelStack(app, "AstraeaFlywheel", {
  env: { account: "793140950071", region: "us-east-2" },
  // The gate judges every proposal before it is stored.
  gateUrl: app.node.tryGetContext("gateUrl") ?? "https://wmc38pwmtw.us-east-2.awsapprunner.com",
  // The daily sweep stays off until the cohort is real: an idle stack costs
  // nothing, a scheduled one bills Bedrock tokens every morning.
  scheduleEnabled: app.node.tryGetContext("scheduleEnabled") === "true",
  description: "Astraea extraction flywheel: EventBridge -> SQS -> Lambda -> gate -> DynamoDB",
});

new PlatformStack(app, "AstraeaPlatform", {
  env: { account: "793140950071", region: "us-east-2" },
  reconBucketName: "astraea-recon-793140950071",
  services: [
    { name: "astraea-gate", id: "a8444a3ceb0c41f78d826a2fc4c65e19" },
    { name: "astraea-portal", id: "8be3b12dbf7746eda39a801306843811" },
  ],
  alarmEmail: "ben.pachter@bellsouth.net",
  // Attached once the certificate validates — deploy with
  //   npx cdk deploy AstraeaPlatform -c appDomain=astraea.thessa.space
  ...(app.node.tryGetContext("appDomain")
    ? {
        appDomain: {
          name: app.node.tryGetContext("appDomain") as string,
          certificateArn:
            "arn:aws:acm:us-east-1:793140950071:certificate/4a6e7e56-d5ff-434c-bd9f-7bc3c45066c2",
        },
      }
    : {}),
  description: "Astraea platform: CDN over the static app, alarms and dashboards over the services",
});

new ServicesStack(app, "AstraeaServices", {
  env: { account: "793140950071", region: "us-east-2" },
  accessRoleArn: "arn:aws:iam::793140950071:role/astraea-apprunner-ecr-access",
  instanceRoleArn: "arn:aws:iam::793140950071:role/astraea-apprunner-instance",
  djangoSecretArn: "arn:aws:secretsmanager:us-east-2:793140950071:secret:astraea/portal/django-secret-key-z7jHDl",
  gateUrl: "https://gate.thessa.space",
  gateCorsOrigins: [
    "https://portal.thessa.space",
    "https://astraea.thessa.space",
    "https://bpachter.github.io",
    // The generated hostnames keep working; nothing that already links to
    // them breaks when the custom domains go live.
    "https://zsc9c6t7g3.us-east-2.awsapprunner.com",
  ],
  portalHosts: ["portal.thessa.space", "zsc9c6t7g3.us-east-2.awsapprunner.com"],
  description: "The two App Runner services, adopted into CDK by import",
});

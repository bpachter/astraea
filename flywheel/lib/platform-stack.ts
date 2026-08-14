import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";

export interface PlatformStackProps extends cdk.StackProps {
  /**
   * Custom domain for the app, once its certificate is validated. Left unset
   * the distribution serves only its cloudfront.net name, so the stack is
   * deployable before DNS exists — the alias is additive, not a precondition.
   */
  appDomain?: { name: string; certificateArn: string };
  /** Bucket holding the compiled recon app; created by the ship script. */
  reconBucketName: string;
  /** App Runner services to watch: the id is the GUID tail of the ARN. */
  services: { name: string; id: string }[];
  /** Where alarms go. Confirm the subscription from the email AWS sends. */
  alarmEmail: string;
}

/**
 * The platform around the two services: a CDN in front of the static app, and
 * the observability that turns "is it up?" from a manual curl into an alarm.
 *
 * Deliberately additive — it watches the App Runner services rather than
 * defining them, so adopting it cannot disturb anything already serving
 * traffic. The services themselves are imported into CDK separately.
 */
export class PlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);

    // ---- CDN over the static app ----------------------------------------
    // The bucket is private and must stay private: CloudFront reaches it with
    // an Origin Access Control, so the only public door is the distribution.
    const bucket = s3.Bucket.fromBucketName(this, "ReconBucket", props.reconBucketName);

    const distribution = new cloudfront.Distribution(this, "ReconCdn", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // The 14 MB atlas is immutable per build (hashed asset names), so it
        // should be cached at the edge rather than re-fetched from Ohio.
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: "index.html",
      // A single-page app owns its routes: unknown paths return the shell
      // rather than an S3 error document.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // NA + EU: cheapest
      comment: "Astraea recon app",
      // CloudFront only accepts certificates from us-east-1, whatever region
      // the distribution's other resources live in.
      ...(props.appDomain
        ? {
            domainNames: [props.appDomain.name],
            certificate: acm.Certificate.fromCertificateArn(
              this,
              "AppCertificate",
              props.appDomain.certificateArn,
            ),
          }
        : {}),
    });

    // fromBucketName gives an immutable reference, so the read grant is
    // written explicitly rather than through bucket.grantRead.
    new s3.CfnBucketPolicy(this, "ReconBucketPolicy", {
      bucket: props.reconBucketName,
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AllowCloudFrontRead",
            Effect: "Allow",
            Principal: { Service: "cloudfront.amazonaws.com" },
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${props.reconBucketName}/*`,
            Condition: {
              StringEquals: {
                "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
              },
            },
          },
        ],
      },
    });

    // ---- alarms ----------------------------------------------------------
    const alarmTopic = new sns.Topic(this, "AlarmTopic", {
      displayName: "Astraea alarms",
    });
    alarmTopic.addSubscription(new subscriptions.EmailSubscription(props.alarmEmail));

    const serviceMetric = (
      service: { name: string; id: string },
      metricName: string,
      statistic: string,
    ) =>
      new cloudwatch.Metric({
        namespace: "AWS/AppRunner",
        metricName,
        dimensionsMap: { ServiceName: service.name, ServiceID: service.id },
        statistic,
        period: cdk.Duration.minutes(5),
      });

    const widgets: cloudwatch.IWidget[] = [];

    for (const service of props.services) {
      const errors = serviceMetric(service, "5xxStatusResponses", "Sum");
      const latency = serviceMetric(service, "RequestLatency", "p99");
      const instances = serviceMetric(service, "ActiveInstances", "Maximum");

      new cloudwatch.Alarm(this, `${service.name}-5xx`, {
        metric: errors,
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `${service.name} is returning server errors`,
      }).addAlarmAction(new actions.SnsAction(alarmTopic));

      new cloudwatch.Alarm(this, `${service.name}-latency`, {
        metric: latency,
        threshold: 5000, // ms — generous; this catches "wedged", not "slow"
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `${service.name} p99 latency is above 5s`,
      }).addAlarmAction(new actions.SnsAction(alarmTopic));

      widgets.push(
        new cloudwatch.GraphWidget({
          title: `${service.name} — traffic and errors`,
          width: 12,
          left: [
            serviceMetric(service, "Requests", "Sum"),
            serviceMetric(service, "2xxStatusResponses", "Sum"),
          ],
          right: [errors, serviceMetric(service, "4xxStatusResponses", "Sum")],
        }),
        new cloudwatch.GraphWidget({
          title: `${service.name} — latency and instances`,
          width: 12,
          left: [latency, serviceMetric(service, "RequestLatency", "Average")],
          right: [instances],
        }),
      );
    }

    const dashboard = new cloudwatch.Dashboard(this, "PlatformDashboard", {
      dashboardName: "astraea-platform",
    });
    dashboard.addWidgets(...widgets);
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "CDN — requests and error rate",
        width: 24,
        left: [
          new cloudwatch.Metric({
            namespace: "AWS/CloudFront",
            metricName: "Requests",
            dimensionsMap: { DistributionId: distribution.distributionId, Region: "Global" },
            statistic: "Sum",
            region: "us-east-1", // CloudFront publishes metrics only here
            period: cdk.Duration.hours(1),
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: "AWS/CloudFront",
            metricName: "TotalErrorRate",
            dimensionsMap: { DistributionId: distribution.distributionId, Region: "Global" },
            statistic: "Average",
            region: "us-east-1",
            period: cdk.Duration.hours(1),
          }),
        ],
      }),
    );

    new cdk.CfnOutput(this, "CdnUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "AlarmTopicArn", { value: alarmTopic.topicArn });
  }
}

import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";

export interface FlywheelStackProps extends cdk.StackProps {
  /** The deployed gate. Proposals are judged here before anything is stored. */
  gateUrl: string;
  /** Bedrock model for the proposal step. */
  modelId?: string;
  /** Cron for the sweep. Off by default — enable when the cohort is real. */
  scheduleEnabled?: boolean;
}

export class FlywheelStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FlywheelStackProps) {
    super(scope, id, props);

    // Current Anthropic models on Bedrock are invoked through a cross-region
    // INFERENCE PROFILE ("us." prefix), not the bare foundation-model id —
    // calling the bare id returns a ValidationException.
    // Nova needs no use-case submission; Anthropic models are a drop-in swap
    // through the Converse API once that form is submitted for the account.
    const modelId = props.modelId ?? "us.amazon.nova-2-lite-v1:0";
    // The profile routes to the same model in several regions, so the policy
    // must permit the underlying foundation model wherever it lands.
    const baseModelId = modelId.replace(/^(us|global|eu|apac)\./, "");

    // ---- storage ---------------------------------------------------------
    // Partition key is the idempotency key: a redelivered SQS message rewrites
    // its item instead of appending a duplicate.
    const proposals = new dynamodb.Table(this, "Proposals", {
      partitionKey: { name: "proposal_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // demo data; rebuilt by a run
    });

    // ---- queues ----------------------------------------------------------
    // A poison message must stop costing money and start being visible: three
    // failed receives and it parks in the DLQ, whose depth is the alarm.
    const deadLetterQueue = new sqs.Queue(this, "WorkDlq", {
      retentionPeriod: cdk.Duration.days(14),
    });

    const workQueue = new sqs.Queue(this, "WorkQueue", {
      // Longer than the extractor's timeout, or a slow model call would let the
      // message reappear while it is still being processed.
      visibilityTimeout: cdk.Duration.minutes(6),
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 3 },
    });

    // ---- functions -------------------------------------------------------
    // Explicit log groups rather than `logRetention`, which provisions a
    // custom-resource Lambda to set retention after the fact.
    const plannerLogs = new logs.LogGroup(this, "PlannerLogs", {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const planner = new lambda.Function(this, "Planner", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "planner.handler",
      code: lambda.Code.fromAsset("lambda"),
      timeout: cdk.Duration.seconds(30),
      logGroup: plannerLogs,
      environment: { WORK_QUEUE_URL: workQueue.queueUrl },
    });
    workQueue.grantSendMessages(planner);

    const extractorLogs = new logs.LogGroup(this, "ExtractorLogs", {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const extractor = new lambda.Function(this, "Extractor", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "extractor.handler",
      code: lambda.Code.fromAsset("lambda"),
      // Comfortably inside the queue's visibility timeout.
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      logGroup: extractorLogs,
      environment: {
        PROPOSALS_TABLE: proposals.tableName,
        GATE_URL: props.gateUrl,
        BEDROCK_MODEL_ID: modelId,
      },
    });
    proposals.grantWriteData(extractor);
    extractor.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:Converse"],
        // Scoped to one model: the profile it is called through, and the
        // foundation model that profile may route to.
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${modelId}`,
          `arn:aws:bedrock:*::foundation-model/${baseModelId}`,
        ],
      }),
    );
    // Metrics are the observability half of the pipeline; without this the
    // function writes its record, fails on PutMetricData, and SQS redelivers
    // work that is already durably stored.
    extractor.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"], // PutMetricData takes no resource ARN
        conditions: { StringEquals: { "cloudwatch:namespace": "Astraea/Flywheel" } },
      }),
    );

    extractor.addEventSource(
      new SqsEventSource(workQueue, {
        // One message per invocation: a batch would let one bad filing fail
        // three good ones back into the queue.
        batchSize: 1,
        maxConcurrency: 5,
      }),
    );

    // ---- schedule --------------------------------------------------------
    new events.Rule(this, "DailySweep", {
      schedule: events.Schedule.cron({ minute: "0", hour: "7" }),
      enabled: props.scheduleEnabled ?? false,
      targets: [new targets.LambdaFunction(planner)],
      description: "Fill the extraction queue once a day",
    });

    // ---- alarms ----------------------------------------------------------
    // Anything in the DLQ means extraction is failing repeatedly and silently.
    new cloudwatch.Alarm(this, "PoisonMessagesAlarm", {
      metric: deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(5),
        statistic: "Maximum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "A message failed extraction three times and parked in the DLQ",
    });

    new cloudwatch.Alarm(this, "ExtractorErrorsAlarm", {
      metric: extractor.metricErrors({ period: cdk.Duration.minutes(15) }),
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "The extractor is erroring repeatedly",
    });

    // Extraction quality as a graph rather than a feeling: one line per named
    // failure mode the gate can return.
    const dashboard = new cloudwatch.Dashboard(this, "FlywheelDashboard", {
      dashboardName: "astraea-flywheel",
    });
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Gate verdicts by failure mode",
        width: 12,
        left: [
          "publishable",
          "unreconciled",
          "undetected_rollup",
          "duplicate_facts",
          "no_consolidated",
          "no_segments",
        ].map(
          (mode) =>
            new cloudwatch.Metric({
              namespace: "Astraea/Flywheel",
              metricName: "Verdict",
              dimensionsMap: { FailureMode: mode },
              label: mode,
              statistic: "Sum",
              period: cdk.Duration.hours(1),
            }),
        ),
      }),
      new cloudwatch.GraphWidget({
        title: "Queue depth and poison messages",
        width: 12,
        left: [workQueue.metricApproximateNumberOfMessagesVisible()],
        right: [deadLetterQueue.metricApproximateNumberOfMessagesVisible()],
      }),
    );

    // ---- outputs ---------------------------------------------------------
    new cdk.CfnOutput(this, "WorkQueueUrl", { value: workQueue.queueUrl });
    new cdk.CfnOutput(this, "DeadLetterQueueUrl", { value: deadLetterQueue.queueUrl });
    new cdk.CfnOutput(this, "ProposalsTableName", { value: proposals.tableName });
    new cdk.CfnOutput(this, "PlannerFunctionName", { value: planner.functionName });
  }
}

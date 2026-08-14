import * as cdk from "aws-cdk-lib";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

export interface ServicesStackProps extends cdk.StackProps {
  accessRoleArn: string;
  instanceRoleArn: string;
  djangoSecretArn: string;
  /** Where the portal reaches the gate — the custom domain once it is live. */
  gateUrl: string;
  /** Every origin allowed to call the gate from a browser. */
  gateCorsOrigins: string[];
  /** Hostnames the portal will answer to; Django rejects any other Host. */
  portalHosts: string[];
}

/**
 * The two App Runner services, as code.
 *
 * These were created by deploy/ship-phase2.ps1 and are adopted here with
 * `cdk import` rather than recreated: their generated hostnames are baked into
 * the published portfolio, the walkthrough recording, and each other's CORS
 * configuration, so a replacement would break all three. Import brings running
 * resources under CloudFormation without touching them — and `cdk diff`
 * returning empty afterwards is the proof that this definition matches what is
 * actually deployed.
 *
 * Both carry RETAIN: a `cdk destroy` should never be able to delete a live
 * service by accident.
 *
 * Deliberately still true after adoption: CI deploys images with
 * StartDeployment, never UpdateService, so a pipeline compromise cannot
 * repoint a service at an arbitrary image.
 */
export class ServicesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props);

    const registry = `${this.account}.dkr.ecr.${this.region}.amazonaws.com`;

    // ---- tracing ---------------------------------------------------------
    // Attaching this runs an OpenTelemetry collector beside each container:
    // the apps export OTLP to localhost and App Runner forwards to X-Ray, so
    // nothing in the image needs AWS credentials or a daemon of its own.
    const tracing = new apprunner.CfnObservabilityConfiguration(this, "Tracing", {
      observabilityConfigurationName: "astraea-xray",
      traceConfiguration: { vendor: "AWSXRAY" },
    });

    // The collector publishes segments using the service's INSTANCE role, so
    // each service needs one that can write to X-Ray.
    const xray = iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess");

    const gateInstanceRole = new iam.Role(this, "GateInstanceRole", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
      description: "Astraea gate runtime identity: X-Ray write only",
      managedPolicies: [xray],
    });

    // The portal already has an instance role (it reads the Django secret);
    // import it mutably and add tracing rather than replacing it.
    iam.Role.fromRoleArn(this, "PortalInstanceRole", props.instanceRoleArn, {
      mutable: true,
    }).addManagedPolicy(xray);

    const observability = {
      observabilityEnabled: true,
      observabilityConfigurationArn: tracing.attrObservabilityConfigurationArn,
    };

    const gate = new apprunner.CfnService(this, "GateService", {
      serviceName: "astraea-gate",
      sourceConfiguration: {
        autoDeploymentsEnabled: false,
        authenticationConfiguration: { accessRoleArn: props.accessRoleArn },
        imageRepository: {
          imageIdentifier: `${registry}/astraea-gate:latest`,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "8080",
            runtimeEnvironmentVariables: [
              { name: "AtlasDir", value: "/app/atlas" },
              // Presence of this endpoint is what enables tracing in the app;
              // 4317 is where App Runner's sidecar collector listens.
              { name: "OTEL_EXPORTER_OTLP_ENDPOINT", value: "http://localhost:4317" },
              // Server-side callers and the published static app, in the
              // order the gate's configuration parser expects.
              { name: "PortalOrigins", value: props.gateCorsOrigins.join(";") },
            ],
          },
        },
      },
      instanceConfiguration: { cpu: "256", memory: "512", instanceRoleArn: gateInstanceRole.roleArn },
      observabilityConfiguration: observability,
      healthCheckConfiguration: {
        protocol: "HTTP",
        path: "/healthz",
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
    });
    gate.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    const portal = new apprunner.CfnService(this, "PortalService", {
      serviceName: "astraea-portal",
      sourceConfiguration: {
        autoDeploymentsEnabled: false,
        authenticationConfiguration: { accessRoleArn: props.accessRoleArn },
        imageRepository: {
          imageIdentifier: `${registry}/astraea-portal:latest`,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "8000",
            runtimeEnvironmentVariables: [
              { name: "ASTRAEA_GATE_URL", value: props.gateUrl },
              { name: "DJANGO_DEBUG", value: "0" },
              { name: "OTEL_EXPORTER_OTLP_ENDPOINT", value: "http://localhost:4317" },
              // Django answers 400 to any Host it was not told about, so the
              // custom domain must be listed before DNS points at it.
              { name: "DJANGO_ALLOWED_HOSTS", value: props.portalHosts.join(",") },
              {
                name: "DJANGO_CSRF_TRUSTED_ORIGINS",
                value: props.portalHosts.map((h) => `https://${h}`).join(","),
              },
            ],
            // By ARN, never by value: the key Django signs sessions with must
            // not be readable from the service description.
            runtimeEnvironmentSecrets: [
              { name: "DJANGO_SECRET_KEY", value: props.djangoSecretArn },
            ],
          },
        },
      },
      // The instance role is what lets the running container read that secret.
      instanceConfiguration: {
        cpu: "256",
        memory: "512",
        instanceRoleArn: props.instanceRoleArn,
      },
      observabilityConfiguration: observability,
      healthCheckConfiguration: {
        protocol: "HTTP",
        path: "/admin/login/",
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
    });
    portal.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    new cdk.CfnOutput(this, "GateServiceUrl", { value: gate.attrServiceUrl });
    new cdk.CfnOutput(this, "PortalServiceUrl", { value: portal.attrServiceUrl });
  }
}

"""OpenTelemetry tracing for the portal, exported to X-Ray via App Runner.

App Runner runs an OpenTelemetry collector beside the container when the
service has an observability configuration attached, so the app exports OTLP to
localhost and never needs AWS credentials of its own.

The point of tracing here is one specific hop: the portal calling the gate to
adjudicate a proposal. Without propagation those are two unrelated traces —
"Django was slow" and "the gate was slow" — and the interesting question, *how
much of the portal's latency is the gate*, has no answer. With the X-Ray
propagator the outbound `requests` call carries the trace context and the two
services appear as one story.

Tracing stays off unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so local runs and
the test suite never start an exporter with nowhere to send.
"""

import os


def configure():
    """Wire up tracing. Returns True if it was enabled."""
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return False

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.django import DjangoInstrumentor
    from opentelemetry.instrumentation.requests import RequestsInstrumentor
    from opentelemetry.propagate import set_global_textmap
    from opentelemetry.propagators.aws import AwsXRayPropagator
    from opentelemetry.sdk.extension.aws.trace import AwsXRayIdGenerator
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider(
        resource=Resource.create({"service.name": "astraea-portal"}),
        # X-Ray rejects ids whose leading bits are not an epoch second.
        id_generator=AwsXRayIdGenerator(),
    )
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    # X-Amzn-Trace-Id in, X-Amzn-Trace-Id out — this is what stitches the
    # portal's span to the gate's.
    set_global_textmap(AwsXRayPropagator())

    DjangoInstrumentor().instrument()
    RequestsInstrumentor().instrument()
    return True

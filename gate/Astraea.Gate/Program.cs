using System.Text.Json;
using Astraea.Gate;
using OpenTelemetry.Extensions.AWS.Trace;
using OpenTelemetry;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);

// ---- tracing ---------------------------------------------------------------
// App Runner runs an OpenTelemetry collector beside this container and forwards
// to X-Ray, so the app exports OTLP to localhost and needs no AWS credentials
// of its own. Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set, which keeps local
// runs and the test suite free of an exporter that has nowhere to send.
if (!string.IsNullOrEmpty(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
{
    builder.Services.AddOpenTelemetry()
        .WithTracing(tracing => tracing
            // X-Ray requires trace ids whose high bits are the epoch second,
            // and the portal propagates context in the X-Amzn-Trace-Id header —
            // without both, the two services produce unrelated traces instead
            // of one story.
            .AddXRayTraceId()
            .SetResourceBuilder(ResourceBuilder.CreateDefault().AddService("astraea-gate"))
            .AddAspNetCoreInstrumentation(options =>
                // Health checks are noise: App Runner probes /healthz every 10s.
                options.Filter = context => context.Request.Path != "/healthz")
            .AddOtlpExporter());
    Sdk.SetDefaultTextMapPropagator(new AWSXRayPropagator());
}

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.SerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower;
});

// The Django portal calls the gate server-side, so CORS matters only if a
// browser client ever talks to the gate directly. Origins are configurable
// because port 8000 is not bindable on every Windows machine.
var portalOrigins = (builder.Configuration["PortalOrigins"]
    ?? "http://localhost:8000;http://127.0.0.1:8000;http://localhost:8642")
    .Split(';', StringSplitOptions.RemoveEmptyEntries);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(portalOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();
app.UseCors();

app.MapGet("/healthz", () => Results.Ok(new { status = "ok", service = "astraea-gate" }));

app.MapGet("/failure-modes", () => Results.Ok(
    ReconciliationEngine.FailureModes
        .Concat(OntologyLaw.FailureModes)
        .ToDictionary(kv => kv.Key, kv => kv.Value)));

app.MapPost("/reconcile", (ExtractionProposal proposal) =>
    Results.Ok(ReconciliationEngine.Evaluate(proposal)));

// Fitted by the portal's calibrate_confidence command from real adjudication
// outcomes; absent file = no calibrated field, never a made-up one.
var calibration = CalibrationTable.LoadOrNull(
    Path.Combine(AppContext.BaseDirectory, "calibration.json"));

app.MapGet("/calibration", () =>
    calibration is null
        ? Results.NotFound(new { error = "no calibration table fitted yet — run manage.py calibrate_confidence" })
        : Results.Ok(calibration));

app.MapPost("/validate-edge", (EdgeProposalDto edge) =>
{
    var verdict = OntologyLaw.ValidateEdge(edge);
    if (calibration is not null && edge.Confidence is { } raw)
        verdict = verdict with { CalibratedConfidence = calibration.Apply((double)raw) };
    return Results.Ok(verdict);
});

app.MapPost("/validate-merge", (MergeProposalDto merge) =>
    Results.Ok(OntologyLaw.ValidateMerge(merge)));

app.MapPost("/validate-retype", (RetypeProposalDto retype) =>
    Results.Ok(OntologyLaw.ValidateRetype(retype)));

// ---- Traditional lookup: versioned, paged node search over the atlas ------
var atlasProbes = builder.Configuration["AtlasDir"] is { } configured
    ? new[] { configured }
    : AtlasCatalog.DefaultProbePaths(app.Environment.ContentRootPath);
var catalog = atlasProbes.Select(AtlasCatalog.LoadOrNull).FirstOrDefault(c => c is not null);

app.MapGet("/api/v1/nodes", (string? query, string? kind, int page = 1, int pageSize = 25) =>
    catalog is null
        ? Results.Json(new
        {
            error = "atlas catalog not present on this deployment",
            probed = atlasProbes,
            hint = "set AtlasDir to a directory containing the pipeline's subsystems/ output",
        }, statusCode: 503)
        : Results.Ok(catalog.Search(query, kind, page, pageSize)));

app.MapGet("/api/v1/nodes/{id}", (string id) =>
    catalog is null
        ? Results.Json(new { error = "atlas catalog not present on this deployment" }, statusCode: 503)
        : catalog.Find(id) is { } entity
            ? Results.Ok(entity)
            : Results.NotFound(new { error = $"no atlas entity with id '{id}'" }));

app.UseStaticFiles();
app.MapGet("/lookup", () => Results.Redirect("/lookup.html"));

app.Run();

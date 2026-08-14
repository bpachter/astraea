using System.Text.Json;
using Astraea.Gate;

var builder = WebApplication.CreateBuilder(args);

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

app.MapPost("/validate-edge", (EdgeProposalDto edge) =>
    Results.Ok(OntologyLaw.ValidateEdge(edge)));

app.MapPost("/validate-merge", (MergeProposalDto merge) =>
    Results.Ok(OntologyLaw.ValidateMerge(merge)));

app.MapPost("/validate-retype", (RetypeProposalDto retype) =>
    Results.Ok(OntologyLaw.ValidateRetype(retype)));

app.Run();

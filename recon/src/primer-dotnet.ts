// .NET & distributed-systems fluency track — practical nomenclature for an
// engineer returning to C#/.NET after years in Python/Django/TypeScript.
// Every chapter anchors to code in THIS repo (Themis.Gate is the reader's own
// C# service) and bridges from stacks the reader is already fluent in.

import type { PrimerChapter } from "./primer-content";

export const DOTNET_TRACK_TITLE = ".NET & the distributed stack, back up to speed";
export const DOTNET_TRACK_LEDE =
  "Practical language and nomenclature for C#, ASP.NET Core, and the " +
  "event-driven cloud patterns that enterprise .NET teams speak in — anchored " +
  "to this repo's own gate service, and bridged from Django and TypeScript so " +
  "rusty knowledge reattaches to things you use daily.";
export const DOTNET_TRACK_CREDIT =
  "Anchored to gate/Themis.Gate in this repository — a working ASP.NET Core 8 " +
  "service with 22 xUnit tests you can read, run, and defend in conversation.";

export const DOTNET_CHAPTERS: PrimerChapter[] = [
  {
    id: "runtime-words",
    number: 1,
    title: "The runtime and its words",
    kicker: "WHAT THE NOUNS MEAN BEFORE ANY CODE",
    sections: [
      {
        paragraphs: [
          "The vocabulary stack, bottom-up: C# is the language; .NET is the platform (runtime + libraries + SDK); the CLR is the virtual machine that JIT-compiles your IL to native code ('managed code' means the CLR manages memory and safety); the BCL is the standard library; ASP.NET Core is the web framework on top. Say '.NET' today and you mean the modern cross-platform one — the Windows-only lineage is called '.NET Framework' (4.8, legacy), and the transition era was branded '.NET Core'. If an interviewer says 'Core', they're distinguishing from Framework.",
          "Release cadence is annual, alternating LTS and STS: .NET 6 and 8 were LTS, 10 is the current LTS (late 2025). Themis targets net8.0 — that string in the .csproj is the TFM (target framework moniker) — and 'we're planning the 8-to-10 bump' is a normal, low-drama sentence on any team. NuGet is pip/npm; the .csproj is pyproject.toml/package.json (PackageReference entries are your dependencies); a .sln groups projects the way a monorepo workspace does. `dotnet restore / build / test / run / publish` is the CLI you already used to build this repo's gate.",
          "One more pair worth having ready: JIT is the default (compile-on-run); AOT ('Native AOT') compiles to a self-contained native binary at publish time — smaller cold starts, popular for Lambda and containers, with the trade-off that runtime reflection gets constrained.",
        ],
      },
    ],
    terms: [
      { term: "CLR / IL / managed code", def: "The runtime VM; the bytecode C# compiles to; code whose memory and safety the runtime manages — the JVM analogy is exact." },
      { term: "TFM (net8.0)", def: "Target framework moniker in the .csproj — which platform version you compile against. Themis.Gate: net8.0, the LTS it was built on." },
      { term: "LTS vs STS", def: "Long-term (3yr) vs standard-term (18mo) support; even numbers are LTS. Knowing the cadence signals you operate services, not just write code." },
      { term: "NuGet / .csproj / .sln", def: "Package manager / project manifest / solution grouping — pip+pyproject and npm+package.json map one-to-one." },
    ],
    checks: [
      { q: "An interviewer asks 'Framework or Core?' — what are they really asking?", a: "Whether the codebase is legacy Windows-only .NET Framework 4.x or modern cross-platform .NET. The answer shapes everything: deployment targets, library availability, and how painful the migration story is." },
      { q: "Where would you look to see what a C# project depends on and targets?", a: "The .csproj: TargetFramework for the TFM, PackageReference items for NuGet dependencies — same role as pyproject.toml or package.json." },
    ],
    reconLinks: [],
  },
  {
    id: "modern-csharp",
    number: 2,
    title: "Modern C#, in code you already own",
    kicker: "READ RECONCILIATION.CS AND SPEAK ITS IDIOMS",
    sections: [
      {
        paragraphs: [
          "Open gate/Themis.Gate/Reconciliation.cs and most of modern C# is on one page. `record` types (`public sealed record SegmentFact(...)`) are immutable value objects with structural equality — dataclass(frozen=True) with less ceremony — and the idiom for domain modeling: facts don't mutate, they get replaced (`with` expressions clone-and-modify). `init`-only setters and `required` members serve the same immutability culture. Nullable reference types (the `?` on `decimal?`, `string?`) are the big post-2019 shift: the compiler tracks null flow like a type checker, and `is not > 0m` / `is null` pattern matching is how modern code branches on it.",
          "LINQ is the QuerySet of C#: `operating.Where(...).Sum(...)`, `GroupBy`, `FirstOrDefault` — method chains over IEnumerable. The word to say out loud is deferred execution: like a Django QuerySet, a LINQ query doesn't run until enumerated, which is both the superpower (composition) and the classic bug source (multiple enumeration, or capturing a query instead of a result). Themis materializes with `.ToList()` exactly where it needs stable results.",
          "Two money-adjacent idioms worth volunteering: `decimal` for anything financial (base-10, no float drift — the gate's tolerance math is all decimal, and 383_285_000_000m's digit separators keep whole-USD readable), and expression-level guards like `Math.Abs(deltaPct) <= TolerancePct` kept in one place so the rule reads as the spec. Collection expressions (`[.. name.Where(char.IsLetterOrDigit)]`) are the C# 12 spread syntax — recognize it so new code doesn't look foreign.",
        ],
      },
    ],
    terms: [
      { term: "record / with / init", def: "Immutable value types with structural equality and clone-with-changes — the domain-modeling default. Reconciliation.cs is built from them." },
      { term: "Nullable reference types", def: "Compiler-enforced null tracking on ordinary references (string?), flipped on per-project — C#'s answer to Optional/mypy strictness." },
      { term: "LINQ + deferred execution", def: "Query composition over sequences that runs on enumeration — QuerySet laziness, same power, same footguns." },
      { term: "decimal vs double", def: "Base-10 exact vs binary float. Money is decimal, always — the gate's whole-USD arithmetic depends on it." },
      { term: "Pattern matching", def: "`is`, `is not`, switch expressions with guards — modern C# branches on shape, not just value." },
    ],
    checks: [
      { q: "Why are the gate's domain types records rather than classes with setters?", a: "Reconciliation verdicts and facts are values: immutable, structurally comparable, safe to share across threads. Records give that by default and make illegal mutation unrepresentable — same instinct as frozen dataclasses." },
      { q: "A LINQ query variable is enumerated twice and hits the database twice. What's the nomenclature for what happened?", a: "Deferred execution with multiple enumeration — the query is a description, not a result. Materialize once with ToList()/ToArray() when you need a stable snapshot." },
    ],
    reconLinks: [],
  },
  {
    id: "aspnet-anatomy",
    number: 3,
    title: "ASP.NET Core anatomy",
    kicker: "PROGRAM.CS IS THE WHOLE STORY",
    sections: [
      {
        paragraphs: [
          "gate/Themis.Gate/Program.cs is the modern shape: WebApplication.CreateBuilder → register services → build → compose middleware → map endpoints → Run. Two big nouns live there. Dependency injection is built into the platform (no library needed): `builder.Services.Add...` registers, constructors receive. The three lifetimes are the interview staple — singleton (one instance forever), scoped (one per HTTP request; where DbContext lives), transient (new every resolution) — and the classic bug is a scoped service captured by a singleton.",
          "The middleware pipeline is Django middleware with explicit ordering: each `app.Use...` wraps the next, so order matters — UseCors before the endpoints it protects, authentication before authorization. Endpoints come in two styles: minimal APIs (`app.MapPost(\"/reconcile\", ...)` — what the gate uses; lambda handlers, low ceremony) and controllers (`[ApiController]` classes with attribute routing — what older enterprise codebases have). Fluency means moving between them without blinking: same pipeline, same DI, different dispatch.",
          "Configuration is layered and env-first: appsettings.json → appsettings.{Environment}.json → environment variables → command line, exposed as `builder.Configuration[...]` — the gate reads PortalOrigins exactly this way, which is why deploys can override CORS without a rebuild. The options pattern (`IOptions<T>` binding a config section to a typed class) is the enterprise idiom for the same thing. Kestrel is the built-in server (gunicorn's role); health endpoints like the gate's /healthz are what container orchestrators probe.",
        ],
      },
    ],
    terms: [
      { term: "DI lifetimes", def: "Singleton / scoped (per-request) / transient — and the captured-scoped-in-singleton bug everyone gets asked about." },
      { term: "Middleware pipeline", def: "Ordered request-wrapping chain; order is semantics. CORS, auth, routing all live here." },
      { term: "Minimal APIs vs controllers", def: "Lambda-mapped endpoints (the gate) vs attribute-routed classes (enterprise legacy) — same platform underneath." },
      { term: "Options pattern / IConfiguration", def: "Layered config (json → env vars) bound to typed classes — 12-factor by default; PortalOrigins in the gate is the live example." },
      { term: "Kestrel", def: "The built-in cross-platform web server — the gunicorn/uvicorn slot in the stack." },
    ],
    checks: [
      { q: "Why must UseCors run before endpoint mapping, and what's the general principle?", a: "Middleware wraps in registration order — a policy applied after dispatch never sees the request. The principle: the pipeline is an onion, and anything cross-cutting must be registered before what it protects." },
      { q: "Where would a DbContext be registered and why that lifetime?", a: "Scoped — one instance per HTTP request. It's a unit of work with change tracking; sharing it across requests (singleton) breaks isolation, and transient defeats the unit-of-work batching." },
    ],
    reconLinks: [],
  },
  {
    id: "async-tasks",
    number: 4,
    title: "Async and the Task model",
    kicker: "THE VOCABULARY OF NOT BLOCKING",
    sections: [
      {
        paragraphs: [
          "C#'s async/await predates JavaScript's and works the same way at the surface: `async Task<T>` methods await I/O without holding a thread. The nouns: Task is a promise; the thread pool schedules continuations; ValueTask is the allocation-avoiding variant you recognize but rarely need to write. The three phrases that mark fluency: 'async all the way down' (never block on async with .Result/.Wait() — that's the classic deadlock in old ASP.NET, and still thread-pool starvation in Core), 'async void is only for event handlers' (unobservable exceptions), and 'pass the CancellationToken' (cooperative cancellation flows as the last parameter through every layer; ASP.NET hands you one per request that fires when the client disconnects).",
          "For background work the platform noun is IHostedService, usually via the BackgroundService base class: a long-running loop hosted in the same process, started and stopped with the app — Celery-worker energy without the broker, for in-process needs. The Themis gate is deliberately synchronous today (pure CPU-bound rule evaluation — async would add ceremony, not throughput), and saying exactly that is itself fluent: async is for I/O-bound waiting; a queue-polling worker in the gate would be the natural BackgroundService, and that sentence connects this chapter to the eventing one.",
        ],
      },
    ],
    terms: [
      { term: "Task / async / await", def: "The promise type and the keywords; async methods return Task<T> and free threads at every await." },
      { term: "Sync-over-async", def: ".Result / .Wait() on a Task — the named antipattern: deadlocks in classic ASP.NET, starvation in Core. 'Async all the way down' is the cure." },
      { term: "CancellationToken", def: "Cooperative cancellation, threaded as a parameter; ASP.NET provides a per-request token tied to the client connection." },
      { term: "BackgroundService / IHostedService", def: "In-process long-running workers with app lifecycle — the queue consumer's natural home in a .NET service." },
    ],
    checks: [
      { q: "Why is the gate's /reconcile endpoint not async, and is that a defect?", a: "It does no I/O — pure in-memory rule evaluation. Async exists to free threads during waiting; wrapping CPU-bound work in Task.Run adds overhead without capacity. Knowing when NOT to async is the senior signal." },
      { q: "Decode 'we had thread-pool starvation from sync-over-async in a hot path'.", a: "Handlers blocked threads with .Result on async calls; under load the pool ran out of threads for continuations, latency spiked. Fix: async all the way down so awaits release threads." },
    ],
    reconLinks: [],
  },
  {
    id: "data-access",
    number: 5,
    title: "Data access, SQL and NoSQL",
    kicker: "EF CORE THROUGH DJANGO EYES, PLUS THE NOSQL LEXICON",
    sections: [
      {
        paragraphs: [
          "EF Core maps almost one-to-one onto the Django ORM you use daily: DbContext ≈ the ORM session/connection, DbSet<T> ≈ a model manager, LINQ over IQueryable ≈ lazy QuerySets (translated to SQL on enumeration), `Include()` ≈ select_related/prefetch_related (say 'eager loading' and 'the N+1 problem'), migrations ≈ migrations (`dotnet ef migrations add`), and change tracking is the unit-of-work magic that makes `SaveChanges()` write everything touched. `AsNoTracking()` is the read-path optimization everyone name-drops. Dapper is the other pole — a micro-ORM: you write SQL, it maps rows to objects; enterprise shops often run EF for CRUD and Dapper for hot reads, and saying that trade-off aloud is instant credibility.",
          "The NoSQL words from the profiles you're reading: DynamoDB and Cosmos DB are the same species — partitioned, replicated document/key-value stores where the partition key decides data distribution and cost of access. DynamoDB nomenclature: partition key + sort key, GSIs (global secondary indexes), RCU/WCU or on-demand capacity, conditional writes (the idempotency workhorse), DynamoDB Streams (change feed), and 'single-table design' (the art of modeling many entity types into one table so access patterns stay one-request). Cosmos equivalents: RU/s as the capacity unit, the change feed, and its five consistency levels (strong → bounded staleness → session → consistent prefix → eventual) — 'session consistency is the default and usually right' is the sentence to have ready.",
          "The bridge sentence for your own story: Themis's portal runs Django ORM over SQLite with the same env-driven swap-to-Postgres posture EF Core teams use — you speak both ORMs' dialects, and the gate's typed rules would sit in front of either.",
        ],
      },
    ],
    terms: [
      { term: "DbContext / DbSet / SaveChanges", def: "EF Core's session, model manager, and unit-of-work commit — Django ORM with explicit save-batching." },
      { term: "Eager loading / N+1 / AsNoTracking", def: "Include() to join up front; the query-per-row trap; tracking off for read-only speed — the three EF phrases interviews reward." },
      { term: "Partition key", def: "The distribution key in DynamoDB/Cosmos — chooses your physical partition, your scaling, and your bill. Bad partition keys are the #1 NoSQL war story." },
      { term: "Conditional write", def: "DynamoDB's compare-and-set (attribute_not_exists…) — how idempotency and optimistic concurrency are actually implemented." },
      { term: "Change feed / Streams", def: "The ordered log of item changes (Cosmos change feed, DynamoDB Streams) that downstream processors consume — CDC as a service." },
      { term: "RU/s, RCU/WCU", def: "Provisioned capacity units in Cosmos and DynamoDB — the currency capacity planning conversations are held in." },
    ],
    checks: [
      { q: "Translate 'select_related' and 'QuerySets are lazy' into EF Core.", a: "Include() for eager loading, and IQueryable's deferred execution — the query builds an expression tree and hits the database on enumeration. Same mental model, different syntax." },
      { q: "Why is 'what's your partition key?' the first question about any DynamoDB/Cosmos table?", a: "It determines data distribution, hot partitions, what queries are cheap point-reads versus expensive scans, and in Cosmos your RU bill. Schema design in these stores IS partition-key design around access patterns." },
    ],
    reconLinks: [],
  },
  {
    id: "eventing",
    number: 6,
    title: "Events, queues, and the reliability lexicon",
    kicker: "THE WORDS BEHIND 'FAULT-TOLERANT, IDEMPOTENT MICROSERVICE'",
    sections: [
      {
        paragraphs: [
          "This is the chapter behind sentences like 'fault-tolerant, idempotent microservice using SNS/SQS with DLQ retries'. The AWS pair: SNS is pub/sub (topics fan out one event to many subscribers), SQS is a queue (one consumer group works messages off); the canonical topology is SNS fan-out into per-service SQS queues. Standard queues are at-least-once with best-effort ordering; FIFO queues add ordering per message-group and deduplication within a five-minute window. Visibility timeout is the lease: an in-flight message is hidden while a consumer works; if processing exceeds the lease, the message reappears — which is precisely why duplicates happen and why idempotency is non-negotiable.",
          "Idempotency, said practically: processing the same message twice must land the system in the same state — implemented with idempotency keys checked via conditional writes, natural keys with upserts, or version checks (optimistic concurrency). When a message fails repeatedly (maxReceiveCount), it redrives to a dead-letter queue (DLQ) — the parking lot for poison messages — and 'DLQ observability and replay tooling' is exactly what an internal operations app exists to provide. Around these sit the pattern names worth dropping accurately: the outbox pattern (write the event into your database in the same transaction as the state change, relay it afterward — kills the dual-write problem), sagas (distributed workflows as steps with compensating actions instead of distributed transactions), backpressure, and eventual consistency (say it with its companion: 'and here's how we bound the staleness').",
          "The Azure dialect, since enterprise .NET careers span both clouds: Service Bus topics+queues ≈ SNS+SQS (richer broker: sessions, dead-lettering built in), Storage Queues are the simpler primitive, Event Grid routes discrete events. And the Themis connection you can make in an interview: the decisions-log export is outbox thinking — state changes captured durably for a separate governed apply step — and the extraction flywheel is an asynchronous producer whose output is gated before publication, which is idempotency's cousin: at-least-once proposing, exactly-once publishing, enforced by the gate.",
        ],
      },
    ],
    terms: [
      { term: "SNS vs SQS (fan-out)", def: "Pub/sub topics vs work queues; SNS→SQS fan-out is the default event-driven topology on AWS." },
      { term: "At-least-once / visibility timeout", def: "Delivery guarantee and the message lease that creates duplicates — the two facts that force idempotency." },
      { term: "Idempotency key", def: "A dedup identity checked with a conditional write so reprocessing is a no-op — the implementation behind the adjective." },
      { term: "DLQ / redrive / poison message", def: "Where repeatedly-failing messages park (maxReceiveCount), the replay path back, and the message that put itself there." },
      { term: "Outbox pattern", def: "Event written transactionally with state, relayed after commit — the standard kill for the dual-write problem." },
      { term: "Saga / compensation", def: "Distributed workflow as a sequence with undo steps instead of a distributed transaction." },
      { term: "Service Bus / Event Grid", def: "The Azure dialect: Service Bus ≈ SNS+SQS with a richer broker; Event Grid for event routing." },
    ],
    checks: [
      { q: "Why does a visibility timeout make idempotency mandatory rather than nice-to-have?", a: "A consumer that works past its lease lets the message reappear and be processed again — duplicates are guaranteed behavior under at-least-once delivery, not a rare failure. The system must define reprocessing as a no-op." },
      { q: "Decode 'centralized management for DLQ retries' — what did that team actually build and why does it matter?", a: "An ops surface over dead-letter queues: inspect poison messages, fix or discard, redrive to source. It matters because DLQs are where data quietly dies; governed replay tooling is the difference between resilience and silent loss — the same governance instinct as Themis's gate." },
      { q: "Where does Themis already embody outbox thinking?", a: "export_decisions: adjudication outcomes are written as a durable log for a separate, reversible apply step against the graph — state change and its downstream effect are decoupled through a persisted record, never a dual write." },
    ],
    reconLinks: [],
  },
  {
    id: "containers-k8s",
    number: 7,
    title: "Containers and the Kubernetes nouns",
    kicker: "YOU ALREADY SHIP CONTAINERS — NAME THE PARTS",
    sections: [
      {
        paragraphs: [
          "You have the Docker vocabulary in this repo already: gate/Dockerfile is a multi-stage build (SDK image compiles, slim runtime image ships — say 'smaller attack surface and image size'), it runs as a non-root USER, and .dockerignore is doing real security work (keeping local databases out of images). Compose orchestrates the pair locally with service-name DNS (THEMIS_GATE_URL=http://gate:8080) — the same mechanism Kubernetes Services provide cluster-wide.",
          "Kubernetes in one paragraph of nouns: a Pod is the schedulable unit (one or more containers); a Deployment declares desired replica count and rolls updates via ReplicaSets; a Service gives pods a stable virtual IP/DNS name (ClusterIP internally, LoadBalancer at the edge); an Ingress routes HTTP by host/path; ConfigMaps and Secrets inject configuration; the HPA (horizontal pod autoscaler) scales replicas on metrics — that's the machinery behind 'horizontal scaling on a Kubernetes cluster'. The probe pair matters in conversation: liveness ('restart me if this fails') versus readiness ('don't route traffic to me yet') — the gate's /healthz is exactly what these probes hit, and knowing which probe should NOT restart a warming-up service is a favorite interview beat.",
          "The honest positioning sentence for you: Themis deploys on managed containers (App Runner) precisely because a two-service demo doesn't earn Kubernetes' operational surface — and being able to argue when K8s is NOT the answer, while speaking its nouns fluently, reads more principal than reciting them.",
        ],
      },
    ],
    terms: [
      { term: "Multi-stage build", def: "Compile in a fat image, ship a slim one — gate/Dockerfile is the live example; say 'smaller image, smaller attack surface'." },
      { term: "Pod / Deployment / Service / Ingress", def: "Schedulable unit / declarative replica manager / stable virtual endpoint / HTTP router — the four nouns that carry most K8s conversations." },
      { term: "Liveness vs readiness probe", def: "Restart-me vs don't-route-to-me — confusing them causes restart storms during warmup; /healthz is what they hit." },
      { term: "HPA", def: "Horizontal pod autoscaler — replicas scale on CPU/memory/custom metrics; the concrete mechanism behind 'horizontal scaling'." },
      { term: "ConfigMap / Secret", def: "Injected configuration vs injected sensitive configuration — the K8s slot where env-driven settings (like Themis's DJANGO_*) land." },
    ],
    checks: [
      { q: "A service takes 40s to warm caches and gets restart-looped on deploy. Which probe is misconfigured?", a: "Liveness is firing during warmup. Warmup belongs to readiness (withhold traffic) with a startup grace; liveness should only detect a genuinely wedged process." },
      { q: "Make the case that Themis on App Runner, not EKS, is the senior choice.", a: "Two stateless containers with modest traffic don't earn cluster operations — node pools, upgrades, ingress, RBAC. Managed containers give HTTPS, health checks, and scaling with near-zero ops; the K8s vocabulary transfers when scale earns it. Right-sizing infrastructure is the principal-level judgment." },
    ],
    reconLinks: [],
  },
  {
    id: "speaking-it",
    number: 8,
    title: "Speaking it in the room",
    kicker: "DECODE, BRIDGE, AND THE HONEST RUST STORY",
    sections: [
      {
        paragraphs: [
          "Decode drill — take the enterprise sentence and say what it means mechanically. 'Fault-tolerant, idempotent microservice ensuring data consistency across distributed systems' → retries are safe because reprocessing is a no-op (idempotency keys/conditional writes), failures are absorbed by at-least-once delivery plus DLQs, and consistency is eventual with defined convergence. 'Event-based architecture leveraging SNS/SQS for asynchronous communication' → producers publish to topics, per-consumer queues absorb load spikes (that's the resilience claim), and services are temporally decoupled (that's the scalability claim). 'Implemented schema, versioning, paging' in an API → URL-or-header API versioning, cursor-or-offset pagination, and DTOs kept separate from storage models. None of this is exotic — the fluency gap is vocabulary, not concepts you don't know.",
          "Your bridge is genuinely strong, so say it plainly: you've shipped a tested ASP.NET Core 8 service this quarter (typed domain records, minimal APIs, DI, env-driven config, containerized, 22 tests); your daily drivers are Python and TypeScript, and the concepts transfer — Django ORM to EF Core, asyncio to Task, Celery-shaped thinking to BackgroundService and queues. 'It's been years since my C# was daily, so my recent .NET is deliberate re-sharpening — here's the repo' beats any bluff, and interviewers reward the candidate who knows exactly where their rust is.",
          "Questions that make the vocabulary work for you: Which messaging backbone — SQS, Service Bus, or something else — and what does DLQ observability look like today? Are new services minimal APIs or controller-based, and is there a paved road? EF Core everywhere, or Dapper on hot paths? What's the .NET version posture and who owns the LTS bumps? Each one is answerable small talk for them and a fluency signal from you — and every answer maps onto something you have already built in this repository.",
        ],
      },
    ],
    terms: [
      { term: "API versioning / paging", def: "URL/header/media-type versioning; cursor vs offset pagination — the two API-design phrases enterprise JDs test by name." },
      { term: "DTO", def: "Data transfer object — the wire shape kept deliberately separate from the storage model; the gate's request/verdict records are exactly this." },
      { term: "Paved road", def: "The org's blessed defaults (templates, pipelines, libraries) — asking about it signals platform thinking." },
      { term: "Temporal decoupling", def: "Queues let producers and consumers run at different times and speeds — the precise claim inside 'improved resilience and scalability'." },
    ],
    checks: [
      { q: "Give the one-breath honest answer to 'how current is your C#?'", a: "'Daily years ago, deliberately re-sharpened now — I shipped a tested ASP.NET Core 8 service this quarter with typed domain records, DI, and containerized deployment, and the distributed patterns never left: my current work is queues, idempotent pipelines, and governed publication in Python and TypeScript.'" },
      { q: "Turn 'unified 10+ microservices with centralized DLQ retry management' into two informed questions.", a: "'What decides when a DLQ message is replayed versus discarded — is there a governance gate or is it operator judgment?' and 'Does the ops surface show why messages poisoned, or only that they did?' Both come straight from the reliability lexicon and both echo verification discipline you can demonstrate in Themis." },
    ],
    reconLinks: [],
  },
];

# Themis — a governed curation plane for an AI-augmented knowledge graph

AI proposes. A typed service verifies. A human governs. Only then does the graph publish.

Themis is the governance apparatus pattern extracted from [Thessa](https://thessa.space),
a supply/value-chain knowledge graph whose value is that the numbers in it are **true**.
An autonomous extraction flywheel can propose thousands of facts; the one thing it must
never be able to do is publish a plausible wrong number. Themis is the pair of services
that stand between a proposal and the graph:

```mermaid
flowchart LR
    A["Extraction flywheel\n(LLM agents propose facts\n+ independent citation check)"]
    B["Themis.Gate\nASP.NET Core 8\ndeterministic reconciliation"]
    C["Themis Portal\nDjango 5 + DRF\nhuman adjudication"]
    D[("Knowledge graph\npublishes")]
    A -->|proposal| B
    B -->|named verdict| C
    C -->|approved only| D
```

- **`gate/` — Themis.Gate (C# / ASP.NET Core 8).** A deterministic reconciliation
  service: segment revenue publishes only if it ties to the consolidated figure in the
  same filing. Failures come back *named*, never lumped. Deterministic validation wants
  a compiler — the domain is typed records, the rules are LINQ, the suite is xUnit.
- **`portal/` — the adjudication portal (Python / Django 5 + DRF).** The human gate:
  a governed review queue over proposals, their provenance, and their gate verdicts.
  Human-in-the-loop curation is a CRUD-and-permissions problem, and the Django admin is
  the best CRUD-and-permissions machine ever shipped — approve/reject actions, failure-mode
  filters, and a hard refusal to approve anything the gate has not passed.

## Why the gate exists

Real failure shapes this system is built around, learned by shipping something wrong:

| verdict | what actually happened |
|---|---|
| `undetected_rollup` | A "Total" row rode along in the extracted list — every row correct, the sum exactly double. This is how a naive segment sum ends up +126%. |
| `duplicate_facts` | Geography *and* product dimensions flattened into one list — each dollar counted twice, the sum lands at a perfectly plausible 2x. |
| `no_consolidated` | Rows exist but the anchor figure from the same filing is missing. An unanchored sum is unverifiable, so it must not publish. |
| `unreconciled` | Every row looks reasonable; the sum is off by 26%. Absence is honest — a plausible wrong figure is undetectable downstream. |
| `no_segments` | Nothing to reconcile. Say so, loudly. |

The portal enforces the other half of the contract: **approval is structurally impossible
without a passing gate verdict** — not a convention, a refusal in code (HTTP 409 on the
API, a hard error message in the admin).

## Run it

Two processes, no shared infrastructure — the portal reaches the gate over HTTP.

**Gate** (needs .NET 8 SDK):

```bash
dotnet test gate/Themis.sln
```

```bash
dotnet run --project gate/Themis.Gate --urls http://localhost:5210
```

**Portal** (needs Python 3.12+):

```bash
python -m venv .venv && .venv/Scripts/pip install -r portal/requirements.txt
```

```bash
cd portal && ../.venv/Scripts/python manage.py migrate && ../.venv/Scripts/python manage.py seed_proposals && ../.venv/Scripts/python manage.py createsuperuser && ../.venv/Scripts/python manage.py test && ../.venv/Scripts/python manage.py runserver 8642
```

Then open `http://localhost:8642/admin/` → Proposals → select all → action
**"Run reconciliation gate (.NET)"** → watch seven verdicts come back. Try to approve
`Corvid Dynamics` and the portal refuses: *nothing publishes unless it reconciles.*
Approve `Apple Inc.` and it goes through with your name on the review.

Django's default port 8000 sits inside a Windows excluded-port range on some machines;
any port works (`runserver 8642`). The gate URL is configurable via `THEMIS_GATE_URL`.

## The seed data is honest

Two proposals are real — Apple and Microsoft FY2023 reportable segments in **whole USD**,
tying exactly to the consolidated revenue of the same 10-K, with EDGAR provenance links.
Five are synthetic, each modeling one failure mode, and every one is *labeled* synthetic
in the data, the UI, and its citation-check text. Real and fake are never mixed
undeclared — in a system whose product is trust, the demo data holds the same bar.

## The AI layer

Each seeded proposal carries an **independent citation check** — a summary written by an
agent that sees only the proposal and its source, never the extractor's reasoning.
Precomputed text ships in the seed so the demo runs without any API key;
`manage.py citation_check` regenerates them live against the Anthropic API when
`ANTHROPIC_API_KEY` is set (and says exactly that, rather than failing silently, when it
isn't).

This is the division of labor the system argues for: **agents draft and cross-examine,
deterministic code verifies, humans own publication.** The AI is load-bearing for
throughput, never for truth.

## API surface

| service | endpoint | what |
|---|---|---|
| gate | `POST /reconcile` | proposal in, named verdict out (snake_case JSON) |
| gate | `GET /failure-modes` | the failure vocabulary, with definitions |
| gate | `GET /healthz` | liveness |
| portal | `GET /api/proposals/` | the adjudication queue (DRF, read-only) |
| portal | `POST /api/proposals/{id}/gate/` | run the gate for one proposal (auth) |
| portal | `POST /api/proposals/{id}/adjudicate/` | `{"decision": "approve"\|"reject"}` (auth; approve 409s without a passing verdict) |

## Design rules inherited from the parent project

- **Verify against real bytes.** The gate's tests include real filings, and this README's
  walkthrough was executed, not imagined.
- **A wrong number is worse than no number.** The whole apparatus exists to prefer
  a confident absence over a plausible error.
- **Name the failure modes.** `undetected_rollup` can be triaged; "failed" cannot.
- **A catch that returns null must say something.** If the gate is down, the portal says
  *gate unreachable*, in red, and changes nothing — it never degrades into a quiet pass.
- **Money travels in whole units.** `revenue_usd` is whole dollars; a scale riding in a
  column is a unit bug one layer down where nothing can catch it.

## Relationship to Thessa

Thessa's graph (~11,000 organizations, ~22K typed edges over SEC filings and 78K+ federal
contracts) and its database are private. Themis is the governance *pattern* made public,
runnable end-to-end on seeded public data. Same rules, same failure vocabulary, no
proprietary bytes.

## License

MIT

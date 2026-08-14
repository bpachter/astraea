import { useEffect, useState } from "react";
import { Frame } from "./components";
import type { View } from "./App";

// The deployed gate (AWS App Runner, us-east-2). Static builds have no server
// to ask, so the address is a constant; a failed probe degrades to "unknown"
// rather than pretending the service is up.
export const GATE_URL = "https://wmc38pwmtw.us-east-2.awsapprunner.com";
export const PORTAL_URL = "https://zsc9c6t7g3.us-east-2.awsapprunner.com";
const REPO_URL = "https://github.com/bpachter/astraea";

type Probe = { state: "checking" | "up" | "unknown"; entities?: number; calibratedFrom?: number };

export function Overview({ onView }: { onView: (v: View) => void }) {
  const [probe, setProbe] = useState<Probe>({ state: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`${GATE_URL}/api/v1/nodes?pageSize=1`, { signal: controller.signal }).then((r) => r.json()),
      fetch(`${GATE_URL}/calibration`, { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([nodes, calibration]) => {
        if (controller.signal.aborted) return;
        setProbe({
          state: "up",
          entities: nodes.total_items,
          calibratedFrom: calibration.source_n,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setProbe({ state: "unknown" });
      });
    return () => controller.abort();
  }, []);

  return (
    <section>
      <div className="mr-kicker">ASTRAEA — GOVERNED CURATION FOR A KNOWLEDGE GRAPH</div>
      <h1 className="mr-h1">Nothing publishes unless it reconciles</h1>
      <p className="mr-lede">
        AI agents propose facts about companies and supply chains. A typed C# gate refuses
        what does not tie out — with named failure modes, never a bare "failed" — and a
        Django portal makes approval structurally impossible without a passing verdict.
        Its first run against a production graph refused type demotions on nodes holding{" "}
        <b>$10.9B</b> in federal contracts that a name-shape heuristic had misread.
      </p>

      <div className="ov-status">
        {probe.state === "checking" && <span className="ov-dot checking" />}
        {probe.state === "up" && <span className="ov-dot up" />}
        {probe.state === "unknown" && <span className="ov-dot unknown" />}
        {probe.state === "up" ? (
          <>
            Live on AWS · {probe.entities?.toLocaleString()} atlas entities searchable ·
            confidence calibrated from {probe.calibratedFrom?.toLocaleString()} human adjudications
          </>
        ) : probe.state === "checking" ? (
          "Checking the live services…"
        ) : (
          "Live services unreachable from here — the tour below still works; the deployment may be torn down to save cost."
        )}
      </div>

      <div className="ov-grid">
        <div className="bp-frame ov-card">
          <Frame />
          <div className="ov-num">01</div>
          <h3>The 3D atlas</h3>
          <p>
            The omics pyramid made navigable: 2,848 genes rising through 12,931 reactions to
            8,461 metabolites, one metabolic subsystem at a time, built from the Human-GEM
            model. Every node carries its real identifiers — Ensembl, UniProt, KEGG, HMDB,
            ChEBI.
          </p>
          <div className="ov-tag">React · three.js · instanced rendering</div>
          <button className="ov-go" onClick={() => onView("atlas")}>
            EXPLORE THE ATLAS →
          </button>
        </div>

        <div className="bp-frame ov-card">
          <Frame />
          <div className="ov-num">02</div>
          <h3>The lookup API</h3>
          <p>
            The same 24,240 entities through a traditional, versioned Web API —
            <code>/api/v1/nodes?query=&amp;kind=&amp;page=</code> — with a paged search UI in
            front of it. Running live on AWS App Runner as a containerized ASP.NET Core
            service.
          </p>
          <div className="ov-tag">.NET 8 · ASP.NET Core · App Runner</div>
          <a className="ov-go" href={`${GATE_URL}/lookup`} target="_blank" rel="noreferrer">
            OPEN THE LOOKUP ↗
          </a>
        </div>

        <div className="bp-frame ov-card">
          <Frame />
          <div className="ov-num">03</div>
          <h3>The adjudication portal</h3>
          <p>
            Where a human decides. Run the gate over seeded proposals and watch it refuse the
            ones that do not reconcile — a total row hidden in a segment list, two reporting
            dimensions flattened into one, a merge pointing at the wrong survivor.
            <b> Sign in as demo / astraea-demo.</b>
          </p>
          <div className="ov-tag">Django 5 · gunicorn · App Runner</div>
          <a className="ov-go" href={`${PORTAL_URL}/admin/`} target="_blank" rel="noreferrer">
            OPEN THE PORTAL ↗
          </a>
        </div>

        <div className="bp-frame ov-card">
          <Frame />
          <div className="ov-num">04</div>
          <h3>How it is built</h3>
          <p>
            Four services, three languages, one rule. The source is public: the reconciliation
            engine and its 32 tests, the governance queues, the atlas pipeline, the AWS
            deployment script, and a plain-English guide to every cloud service it uses.
          </p>
          <div className="ov-tag">C# · Python · TypeScript · Docker · AWS</div>
          <a className="ov-go" href={REPO_URL} target="_blank" rel="noreferrer">
            READ THE SOURCE ↗
          </a>
        </div>
      </div>

      <div className="ov-more">
        Also here: a <button className="mr-ghost" onClick={() => onView("primer")}>PRIMER ↗</button>{" "}
        that teaches the domain from foundations, and a gated{" "}
        <button className="mr-ghost" onClick={() => onView("graph")}>RECON ↗</button> view for
        architecture briefings.
      </div>
    </section>
  );
}

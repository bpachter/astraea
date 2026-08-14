import type { Palette, View } from "./App";
import { ConfidenceChip } from "./Canvas";
import type { EvidenceSource, GraphNode, ReconGraph, ThemeName } from "./types";

export function Frame() {
  return (
    <>
      <i className="bp-mark tl" aria-hidden />
      <i className="bp-mark tr" aria-hidden />
      <i className="bp-mark bl" aria-hidden />
      <i className="bp-mark br" aria-hidden />
    </>
  );
}

export function Header({
  title,
  theme,
  onTheme,
  view,
  onView,
}: {
  title: string;
  theme: ThemeName;
  onTheme: (t: ThemeName) => void;
  view: View;
  onView: (v: View) => void;
}) {
  return (
    <header className="mr-header">
      <div className="mr-brand">{title.toUpperCase().replace(" ARCHITECTURE", " · ARCHITECTURE")}</div>
      <nav className="mr-views" aria-label="View">
        <button className={view === "overview" ? "active" : ""} onClick={() => onView("overview")}>
          START
        </button>
        <button className={view === "graph" ? "active" : ""} onClick={() => onView("graph")}>
          RECON
        </button>
        <button className={view === "primer" ? "active" : ""} onClick={() => onView("primer")}>
          PRIMER
        </button>
        <button className={view === "atlas" ? "active" : ""} onClick={() => onView("atlas")}>
          ATLAS
        </button>
      </nav>
      <span className="mr-tag">ARCHITECTURE BRIEFING</span>
      <div className="mr-toggle" role="group" aria-label="Theme">
        <button className={theme === "light" ? "active" : ""} onClick={() => onTheme("light")}>
          LIGHT
        </button>
        <button className={theme === "dark" ? "active" : ""} onClick={() => onTheme("dark")}>
          DARK
        </button>
      </div>
    </header>
  );
}

function FamilySample({ palette, familyKey }: { palette: Palette; familyKey: string }) {
  const family = palette.familyOf(familyKey);
  const color = palette.familyColor(familyKey);
  return (
    <svg width={30} height={8} aria-hidden>
      <line
        x1={0}
        y1={4}
        x2={24}
        y2={4}
        stroke={color}
        strokeWidth={family?.strokeWidth ?? 1.15}
        strokeDasharray={family?.strokeDasharray ?? undefined}
        strokeLinecap={family?.strokeDasharray === "1.5 3.5" ? "round" : "butt"}
      />
      <path d="M 23 1 L 29 4 L 23 7" fill="none" stroke={color} strokeWidth={1.2} />
    </svg>
  );
}

export function Intro({
  graph,
  palette,
}: {
  graph: ReconGraph;
  palette: Palette;
  theme: ThemeName;
}) {
  return (
    <section>
      <div className="mr-kicker">
        {graph.meta.kicker ?? "KNOWLEDGE-GRAPH RECON — PUBLIC SOURCES ONLY"}
      </div>
      <h1 className="mr-h1">{graph.meta.headline ?? "The platform, reconstructed"}</h1>
      <p className="mr-lede">{graph.meta.purpose}</p>
      <div className="mr-legend-row">
        <span className="mr-legend-item">
          <span className="mr-chip jd">JD</span> {graph.meta.confidenceLegend.JD}
        </span>
        <span className="mr-legend-item">
          <span className="mr-chip pub">WEB</span> {graph.meta.confidenceLegend.PUB}
        </span>
        <span className="mr-legend-item">
          <span className="mr-chip inf">GUESS</span> {graph.meta.confidenceLegend.INF}
        </span>
        <span className="mr-legend-item">
          <svg width={34} height={10} aria-hidden>
            <line x1={0} y1={5} x2={28} y2={5} stroke="var(--mr-accent-text)" strokeWidth={1.2} />
            <path d="M 27 1.5 L 33 5 L 27 8.5" fill="none" stroke="var(--mr-accent-text)" strokeWidth={1.2} />
          </svg>
          directed relation — click a node to light up its edges
        </span>
      </div>
      <div className="mr-cat-grid">
        <div>
          <div className="mr-cat-heading">NODE CLASS — RAIL COLOUR + GLYPH</div>
          <div className="mr-cat-items">
            {graph.nodeClasses.map((c) => (
              <span key={c.key} className="mr-cat-item">
                <span className="mr-swatch" style={{ background: palette.classColor(c.key) }} />
                <span style={{ color: palette.classColor(c.key) }}>
                  {c.glyph} {c.short}
                </span>
                <span className="mr-count">{c.memberCount}</span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="mr-cat-heading">EDGE FAMILY — COLOUR + LINE PATTERN</div>
          <div className="mr-cat-items families">
            {graph.edgeFamilies.map((f) => (
              <span key={f.key} className="mr-cat-item">
                <FamilySample palette={palette} familyKey={f.key} />
                <span style={{ color: palette.familyColor(f.key) }}>{f.label}</span>
                <span className="mr-fam-note">{f.note}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function EvidenceChip({ source }: { source: EvidenceSource }) {
  const cls = source === "JD" ? "jd" : source === "WEB" ? "pub" : "inf";
  return <span className={`mr-chip ${cls}`}>{source}</span>;
}

export function Dossier({
  graph,
  palette,
  node,
  onSelect,
}: {
  graph: ReconGraph;
  palette: Palette;
  node: GraphNode;
  onSelect: (id: string) => void;
}) {
  const cls = palette.classOf(node.class);
  const classColor = palette.classColor(node.class);
  const connections = graph.edges
    .filter((e) => e.from === node.id || e.to === node.id)
    .map((e) => {
      const outbound = e.from === node.id;
      const otherId = outbound ? e.to : e.from;
      const other = graph.nodes.find((n) => n.id === otherId);
      return { edge: e, outbound, other };
    })
    .filter((c) => c.other);

  return (
    <aside className="mr-dossier-wrap">
      <div className="bp-frame mr-dossier">
        <Frame />
        <div className="mr-dossier-head">
          <span className="mr-dossier-kicker" style={{ color: classColor }}>
            <span>{cls?.glyph}</span> {cls?.key}
          </span>
          <ConfidenceChip confidence={node.confidence} long />
        </div>
        <h3 className="mr-dossier-title">{node.label}</h3>
        <div className="mr-dossier-sub">{node.subtitle}</div>

        <div className="mr-section-heading">WHAT THE EVIDENCE SAYS</div>
        {node.evidence.map((ev, i) => (
          <div key={i} className="mr-evidence">
            <EvidenceChip source={ev.source} />
            <span>{ev.text}</span>
          </div>
        ))}

        <div className="mr-section-heading">WHY IT MATTERS FOR THIS ROLE</div>
        <p className="mr-why">{node.whyItMatters}</p>

        <div className="mr-section-heading">CONNECTS TO</div>
        {connections.map(({ edge, outbound, other }, i) => (
          <button key={i} className="mr-connect" onClick={() => onSelect(other!.id)}>
            <span className="mr-connect-dir" style={{ color: palette.familyColor(edge.family) }}>
              {outbound ? "→" : "←"}
            </span>
            <span className="mr-connect-verb" style={{ color: palette.familyColor(edge.family) }}>
              {edge.verb}
            </span>
            <span style={{ color: palette.classColor(other!.class) }}>
              {palette.classOf(other!.class)?.glyph}
            </span>
            <span className="mr-connect-label">{other!.label}</span>
          </button>
        ))}
        {node.undrawnRelation ? <div className="mr-undrawn">{node.undrawnRelation}</div> : null}

        <div className="mr-section-heading">QUESTIONS WORTH ASKING</div>
        {node.questions.map((q, i) => (
          <div key={i} className="mr-ask">
            <span className="mr-ask-no">{i + 1}</span>
            <span className="mr-ask-q">{q}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function OntologySpec({ graph, palette }: { graph: ReconGraph; palette: Palette }) {
  return (
    <section className="mr-section">
      <div className="mr-kicker">THE ONTOLOGY — READING RULES FOR THE MAP</div>
      <h2 className="mr-h2">Entity classes and relation types</h2>
      <div className="mr-tables">
        <table className="mr-table">
          <thead>
            <tr>
              <th style={{ width: 150 }}>Class</th>
              <th>Definition</th>
              <th style={{ width: 180 }}>Instances</th>
            </tr>
          </thead>
          <tbody>
            {graph.nodeClasses.map((c) => (
              <tr key={c.key}>
                <td
                  className="lead"
                  style={{
                    borderLeft: `3px solid ${palette.classColor(c.key)}`,
                    color: palette.classColor(c.key),
                    fontSize: 13.5,
                    letterSpacing: "0.03em",
                  }}
                >
                  {c.glyph} {c.key}
                </td>
                <td>{c.definition}</td>
                <td>{c.memberCount} on the map</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="mr-table">
          <thead>
            <tr>
              <th style={{ width: 150 }}>Relation</th>
              <th style={{ width: 118 }}>Family</th>
              <th>Meaning</th>
              <th style={{ width: 210 }}>Example</th>
            </tr>
          </thead>
          <tbody>
            {graph.relationTypes.map((r) => (
              <tr key={r.verb}>
                <td
                  className="lead"
                  style={{
                    borderLeft: `3px solid ${r.family ? palette.familyColor(r.family) : "var(--mr-muted-line)"}`,
                    color: r.family ? palette.familyColor(r.family) : "var(--mr-muted)",
                    fontSize: 13,
                  }}
                >
                  {r.verb}
                </td>
                <td
                  className="mr-fam-cell"
                  style={{ color: r.family ? palette.familyColor(r.family) : "var(--mr-muted)" }}
                >
                  {r.family ? palette.familyOf(r.family)?.label : "NOT DRAWN"}
                </td>
                <td>{r.meaning}</td>
                <td>{r.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Thesis({
  graph,
  onJump,
}: {
  graph: ReconGraph;
  onJump: (id: string) => void;
}) {
  return (
    <section className="mr-section">
      <div className="mr-kicker">HOW THE ROLE ACTUALLY WORKS — THE ANGLE TO BRING</div>
      <h2 className="mr-h2">Read as an internal forward-deployed engineer</h2>
      <div className="mr-plates">
        {graph.operatingThesis.map((plate) => {
          const node = graph.nodes.find((n) => n.id === plate.node);
          return (
            <div key={plate.number} className="bp-frame mr-plate">
              <Frame />
              <div className="mr-plate-no">{plate.number}</div>
              <h4>{plate.title}</h4>
              <p className="mr-plate-body">{plate.body}</p>
              <div className="mr-sayit">{plate.sayItAs}</div>
              {node ? (
                <button className="mr-ghost" onClick={() => onJump(node.id)}>
                  {node.label.toUpperCase()} ↗
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Shortlist({
  graph,
  onJump,
}: {
  graph: ReconGraph;
  onJump: (id: string) => void;
}) {
  return (
    <section className="mr-section">
      <div className="mr-kicker">IF YOU ONLY GET TEN QUESTIONS</div>
      <h2 className="mr-h2">The shortlist</h2>
      <div className="mr-shortlist">
        {graph.shortlistQuestions.map((q) => (
          <div key={q.n} className="mr-shortlist-row">
            <span className="mr-shortlist-no">{q.n}</span>
            <span className="mr-shortlist-q">
              {q.question}{" "}
              <button className="mr-ghost" onClick={() => onJump(q.node)}>
                {q.nodeLabel.toUpperCase()} ↗
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Footer({ disclaimer }: { disclaimer: string }) {
  return (
    <footer className="mr-footer">
      Sources: the public job description, metabolon.com, press releases, and published
      metabolomics methods literature. {disclaimer}
    </footer>
  );
}

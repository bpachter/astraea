import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import { Frame } from "./components";
import type {
  AtlasIndex,
  AtlasKind,
  AtlasLink,
  AtlasNode,
  AtlasSubsystem,
  GeneMeta,
  MetaboliteMeta,
  ReactionMeta,
} from "./atlas-types";
import type { ThemeName } from "./types";

const LAYER_Z: Record<number, number> = { 0: -240, 1: 0, 2: 240 };
const DEFAULT_SLUG = "glycolysis-gluconeogenesis";
const LARGE_LINK_COUNT = 4000;
const BROWSE_CAP = 300;

const KIND_COLORS: Record<AtlasKind, { light: string; dark: string }> = {
  gene: { light: "#56479b", dark: "#b3a4ee" },
  reaction: { light: "#3c6285", dark: "#8fbde8" },
  metabolite: { light: "#1c6a6a", dark: "#79cac2" },
};

// Shared across every node of a kind — the digest allocates one mesh per node,
// never one geometry per node.
const GEOMETRIES: Record<AtlasKind, THREE.BufferGeometry> = {
  gene: new THREE.BoxGeometry(7, 7, 7),
  reaction: new THREE.OctahedronGeometry(5.5),
  metabolite: new THREE.SphereGeometry(4.8, 16, 12),
};

function kindColor(kind: AtlasKind, theme: ThemeName) {
  return KIND_COLORS[kind][theme];
}

/** "Enzymatic reaction" would be false for exchange/pool/artificial entries. */
function kindTitle(node: AtlasNode): string {
  if (node.kind === "gene") return "Gene";
  if (node.kind === "metabolite") return "Metabolite";
  return (node.meta as ReactionMeta).spontaneous
    ? "Reaction (no gene association)"
    : "Enzymatic reaction";
}

function endpointId(end: AtlasLink["source"]): string {
  return typeof end === "object" ? end.id : end;
}

function makeLayerLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "600 44px 'Barlow Condensed', sans-serif";
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.85 }),
  );
  sprite.scale.set(160, 20, 1);
  return sprite;
}

function describeFetchError(context: string, error: unknown, status?: number): string {
  if (status === 404) {
    return `${context} not found (404). If you are running from a fresh checkout, rebuild the data: python recon/scripts/build_atlas.py --src <dir>.`;
  }
  const reason = error instanceof Error ? error.message : String(error);
  return `${context} failed to load (${reason}). Check the connection or dev server and retry.`;
}

export default function Atlas({ theme }: { theme: ThemeName }) {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [subsystem, setSubsystem] = useState<AtlasSubsystem | null>(null);
  const [subsystemError, setSubsystemError] = useState<string | null>(null);
  const [slug, setSlug] = useState(DEFAULT_SLUG);
  const [selected, setSelected] = useState<AtlasNode | null>(null);
  const [hideCurrency, setHideCurrency] = useState(true);
  const [retryToken, setRetryToken] = useState(0);
  const [browseFilter, setBrowseFilter] = useState("");
  const fgRef = useRef<ForceGraphMethods<AtlasNode, AtlasLink>>();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 640 });
  const meshesRef = useRef(new Map<string, THREE.Mesh>());
  const prevSelectedRef = useRef<string | null>(null);
  const materialsRef = useRef<{
    base: Record<AtlasKind, THREE.MeshLambertMaterial>;
    highlight: Record<AtlasKind, THREE.MeshLambertMaterial>;
  } | null>(null);

  if (!materialsRef.current) {
    const make = (kind: AtlasKind, highlight: boolean) =>
      new THREE.MeshLambertMaterial({
        color: kindColor(kind, theme),
        emissive: highlight ? kindColor(kind, theme) : "#000000",
        emissiveIntensity: highlight ? 0.9 : 0,
        transparent: true,
        opacity: highlight ? 1 : 0.92,
      });
    materialsRef.current = {
      base: {
        gene: make("gene", false),
        reaction: make("reaction", false),
        metabolite: make("metabolite", false),
      },
      highlight: {
        gene: make("gene", true),
        reaction: make("reaction", true),
        metabolite: make("metabolite", true),
      },
    };
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}atlas/index.json`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
        return r.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setIndex(data);
      })
      .catch((error) => {
        if (controller.signal.aborted || (error as Error)?.name === "AbortError") return;
        console.error("atlas index fetch failed:", error);
        setIndexError(
          describeFetchError("Atlas index", error, (error as { status?: number }).status),
        );
      });
    return () => controller.abort();
  }, [retryToken]);

  useEffect(() => {
    setSelected(null);
    setSubsystem(null);
    setSubsystemError(null);
    setBrowseFilter("");
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}atlas/subsystems/${slug}.json`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
        return r.json();
      })
      .then((data: AtlasSubsystem) => {
        if (!controller.signal.aborted) setSubsystem(data);
      })
      .catch((error) => {
        if (controller.signal.aborted || (error as Error)?.name === "AbortError") return;
        console.error(`subsystem fetch failed for ${slug}:`, error);
        setSubsystemError(
          describeFetchError(`Subsystem "${slug}"`, error, (error as { status?: number }).status),
        );
      });
    return () => controller.abort();
  }, [slug, retryToken]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setStageSize((prev) =>
        prev.width === el.clientWidth && prev.height === el.clientHeight
          ? prev
          : { width: el.clientWidth, height: el.clientHeight },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [index]);

  const graphData = useMemo(() => {
    if (!subsystem) return { nodes: [] as AtlasNode[], links: [] as AtlasLink[] };
    const keep = new Set<string>();
    const nodes = subsystem.nodes
      .filter(
        (n) =>
          !(
            hideCurrency &&
            n.kind === "metabolite" &&
            (n.meta as MetaboliteMeta).currency
          ),
      )
      .map((n) => {
        keep.add(n.id);
        return { ...n, fz: LAYER_Z[n.layer] };
      });
    const links = subsystem.links
      .filter((l) => keep.has(endpointId(l.source)) && keep.has(endpointId(l.target)))
      .map((l) => ({ ...l }));
    return { nodes, links };
  }, [subsystem, hideCurrency]);

  useEffect(() => {
    meshesRef.current.clear();
    prevSelectedRef.current = null;
  }, [graphData]);

  // Identity-stable: the engine digests node objects only when graphData
  // changes, never per render or per click.
  const nodeObject = useCallback((node: AtlasNode) => {
    const mesh = new THREE.Mesh(
      GEOMETRIES[node.kind],
      materialsRef.current!.base[node.kind],
    );
    meshesRef.current.set(node.id, mesh);
    return mesh;
  }, []);

  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const nodeLabel = useCallback(
    (n: AtlasNode) =>
      `<div class="at-tip"><b>${n.label}</b><span>${kindTitle(n)} · ${n.id}</span></div>`,
    [],
  );
  const linkColor = useCallback(
    (l: AtlasLink) =>
      l.kind === "catalyzes"
        ? KIND_COLORS.gene[themeRef.current]
        : themeRef.current === "dark"
          ? "#5a636d"
          : "#9a9da2",
    [],
  );
  const linkWidth = useCallback(
    (l: AtlasLink) => (l.kind === "catalyzes" ? 0.3 : 0.9),
    [],
  );
  const linkArrow = useCallback(
    (l: AtlasLink) => (l.kind === "catalyzes" ? 0 : 4),
    [],
  );

  // Selection highlight mutates exactly two meshes — no scene digest.
  useEffect(() => {
    const materials = materialsRef.current!;
    const prev = prevSelectedRef.current;
    if (prev) {
      const mesh = meshesRef.current.get(prev);
      const node = graphData.nodes.find((n) => n.id === prev);
      if (mesh && node) {
        mesh.material = materials.base[node.kind];
        mesh.scale.setScalar(1);
      }
    }
    if (selected) {
      const mesh = meshesRef.current.get(selected.id);
      if (mesh) {
        mesh.material = materials.highlight[selected.kind];
        mesh.scale.setScalar(1.6);
      }
    }
    prevSelectedRef.current = selected?.id ?? null;
  }, [selected, graphData]);

  // Theme changes update shared materials in place; one refresh re-evaluates
  // link colors. Rare user action, so the single digest is acceptable.
  useEffect(() => {
    const materials = materialsRef.current!;
    (Object.keys(KIND_COLORS) as AtlasKind[]).forEach((kind) => {
      materials.base[kind].color.set(kindColor(kind, theme));
      materials.highlight[kind].color.set(kindColor(kind, theme));
      materials.highlight[kind].emissive.set(kindColor(kind, theme));
    });
    fgRef.current?.refresh();
  }, [theme]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !index || !subsystem) return;
    const scene = fg.scene();
    const grids: THREE.Object3D[] = [];
    const dark = theme === "dark";
    index.layers.forEach((layer) => {
      const color = kindColor(
        layer.index === 0 ? "gene" : layer.index === 1 ? "reaction" : "metabolite",
        theme,
      );
      const grid = new THREE.GridHelper(
        760,
        19,
        new THREE.Color(color),
        new THREE.Color(dark ? "#2a3138" : "#d5d5d7"),
      );
      grid.rotation.x = Math.PI / 2;
      grid.position.z = LAYER_Z[layer.index];
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.5;
      scene.add(grid);
      const label = makeLayerLabel(layer.title, color);
      label.position.set(-440, 390, LAYER_Z[layer.index]);
      scene.add(label);
      grids.push(grid, label);
    });
    return () => {
      grids.forEach((obj) => scene.remove(obj));
    };
  }, [index, subsystem, theme]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !subsystem) return;
    fg.d3Force("link")?.distance((l: AtlasLink) => (l.kind === "catalyzes" ? 170 : 55));
    fg.d3Force("charge")?.strength(-65);
    fg.cameraPosition({ x: 640, y: -720, z: 380 }, { x: 0, y: 0, z: 0 }, 0);
  }, [subsystem]);

  const resetCamera = () =>
    fgRef.current?.cameraPosition({ x: 640, y: -720, z: 380 }, { x: 0, y: 0, z: 0 }, 800);

  const selectNode = useCallback((node: AtlasNode) => setSelected(node), []);

  if (indexError) {
    return (
      <section>
        <div className="mr-kicker">LAYERED-OMICS ATLAS</div>
        <h1 className="mr-h1">The pyramid, in data</h1>
        <p className="mr-lede at-error" role="alert">
          {indexError}
        </p>
        <button className="at-reset" onClick={() => { setIndexError(null); setRetryToken((t) => t + 1); }}>
          RETRY
        </button>
      </section>
    );
  }
  if (!index) {
    return (
      <section>
        <div className="mr-kicker">LAYERED-OMICS ATLAS</div>
        <h1 className="mr-h1">The pyramid, in data</h1>
        <p className="mr-lede">Loading the atlas index…</p>
      </section>
    );
  }

  const row = index.subsystems.find((s) => s.slug === slug);
  const isLarge = (row?.links ?? 0) > LARGE_LINK_COUNT;

  return (
    <section>
      <div className="mr-kicker">LAYERED-OMICS ATLAS — HUMAN-GEM v{index.model.version}</div>
      <h1 className="mr-h1">The pyramid, in data</h1>
      <p className="mr-lede">
        The lecture's opening image made navigable: for each metabolic subsystem, genes
        (genome) connect upward through the reactions they enable to the metabolites those
        reactions transform (metabolome). Every node carries its formal identifiers; every
        edge is a curated model assertion, not an illustration.
      </p>

      <div className="at-controls">
        <label className="at-control">
          <span className="mr-cat-heading">SUBSYSTEM</span>
          <select value={slug} onChange={(e) => setSlug(e.target.value)}>
            {index.subsystems.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name} — {s.reactions} rxn · {s.metabolites} met · {s.genes} genes
              </option>
            ))}
          </select>
        </label>
        <label className="at-control at-check">
          <input
            type="checkbox"
            checked={hideCurrency}
            onChange={(e) => setHideCurrency(e.target.checked)}
          />
          <span>
            Hide currency metabolites <em>(ATP, H₂O, NAD⁺… — disclosed in Methods)</em>
          </span>
        </label>
        <button className="at-reset" onClick={resetCamera}>
          RESET VIEW
        </button>
        <div className="at-counts">
          {graphData.nodes.length} nodes · {graphData.links.length} edges
          {isLarge ? <span className="at-warn"> — large subsystem; layout takes a moment</span> : null}
        </div>
      </div>

      <div className="at-split">
        <div className="at-left">
          <div className="bp-frame at-stage" ref={stageRef}>
            <Frame />
            {subsystemError ? (
              <div className="at-loading at-error" role="alert">
                <div>
                  <p>{subsystemError}</p>
                  <button
                    className="at-reset"
                    onClick={() => setRetryToken((t) => t + 1)}
                  >
                    RETRY
                  </button>
                </div>
              </div>
            ) : subsystem ? (
              <ForceGraph3D
                ref={fgRef}
                width={stageSize.width}
                height={stageSize.height}
                graphData={graphData}
                backgroundColor="rgba(0,0,0,0)"
                showNavInfo={false}
                nodeThreeObject={nodeObject}
                nodeLabel={nodeLabel}
                linkColor={linkColor}
                linkOpacity={0.55}
                linkWidth={linkWidth}
                linkDirectionalArrowLength={linkArrow}
                linkDirectionalArrowRelPos={0.92}
                enableNodeDrag={false}
                warmupTicks={isLarge ? 40 : 0}
                cooldownTicks={isLarge ? 120 : 300}
                onNodeClick={selectNode}
                onBackgroundClick={() => setSelected(null)}
              />
            ) : (
              <div className="at-loading">Loading {row?.name ?? slug}…</div>
            )}
          </div>

          {subsystem ? (
            <BrowsePanel
              subsystem={subsystem}
              filter={browseFilter}
              onFilter={setBrowseFilter}
              onSelect={selectNode}
              selectedId={selected?.id ?? null}
            />
          ) : null}
        </div>

        <aside className="mr-dossier-wrap">
          <div className="bp-frame mr-dossier">
            <Frame />
            {selected && subsystem ? (
              <SelectedDossier
                node={selected}
                subsystem={subsystem}
                index={index}
                theme={theme}
                onSelect={selectNode}
              />
            ) : (
              <>
                <div className="mr-kicker">READING THE PYRAMID</div>
                <h3 className="mr-dossier-title">{row?.name}</h3>
                <div className="mr-dossier-sub">
                  Select a node — in the 3D view or the browse list below it — for its
                  dossier. Shapes by layer: cubes are genes, octahedra are reactions,
                  spheres are metabolites.
                </div>
                {index.layers.map((layer) => (
                  <div key={layer.key}>
                    <div className="mr-section-heading">
                      <span
                        style={{
                          color: kindColor(
                            layer.index === 0 ? "gene" : layer.index === 1 ? "reaction" : "metabolite",
                            theme,
                          ),
                        }}
                      >
                        {layer.title}
                      </span>
                    </div>
                    <p className="mr-why">{layer.note}</p>
                  </div>
                ))}
                <div className="mr-section-heading">PROVENANCE</div>
                <p className="mr-why">
                  {index.model.name}, v{index.model.version} ({index.model.date}),{" "}
                  {index.model.license}. {index.totals.genes.toLocaleString()} genes,{" "}
                  {index.totals.reactions.toLocaleString()} reactions,{" "}
                  {index.totals.metabolites.toLocaleString()} metabolites across{" "}
                  {index.totals.subsystems} subsystems.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>

      <details className="at-methods bp-frame">
        <Frame />
        <summary>METHODS & LIMITATIONS</summary>
        <div className="at-methods-body">
          <p>
            <b>Source.</b> {index.model.citation} Data parsed from the model repository's
            YAML and identifier crosswalk tables; the build script re-derives every file
            from source (<code>recon/scripts/build_atlas.py</code>).
          </p>
          <p>
            <b>Layer mapping.</b> Human-GEM encodes proteins implicitly, as boolean
            gene–reaction rules. The middle layer therefore shows reactions — for
            enzyme-catalyzed steps, the proteome <i>acting</i> — rather than protein
            molecules; a UniProt-backed explicit protein layer is the natural extension.
            The model also contains exchange, demand, pool, and artificial pseudo-reactions
            (modeling constructs, labeled as reactions without gene association here).
            Gene→reaction edges do not distinguish complexes (AND) from isozymes (OR);
            the rule text is shown verbatim in each reaction's dossier.
          </p>
          <p>
            <b>Currency metabolites.</b> Ubiquitous cofactors (ATP, H₂O, NAD⁺/NADH…)
            participate in hundreds of reactions and, drawn naively, dominate the layout.
            Following standard practice in metabolic network visualization they are
            hidden by default and restorable with the toggle above; hiding them removes
            their edges from the scene, not from the model — reaction equations in the
            dossier always show all participants.
          </p>
          <p>
            <b>Accessibility.</b> The 3D canvas is a spatial view, not the only path:
            every node is reachable by keyboard through the browse list, each reaction
            dossier shows the full equation with stoichiometric coefficients in text, and
            metabolite and gene dossiers cross-link to their reactions. For the official
            2D explorer of this model, see Metabolic Atlas (metabolicatlas.org).
          </p>
        </div>
      </details>

      <footer className="mr-footer">{index.model.citation}</footer>
    </section>
  );
}

function BrowsePanel({
  subsystem,
  filter,
  onFilter,
  onSelect,
  selectedId,
}: {
  subsystem: AtlasSubsystem;
  filter: string;
  onFilter: (v: string) => void;
  onSelect: (n: AtlasNode) => void;
  selectedId: string | null;
}) {
  const query = filter.trim().toLowerCase();
  const groups: Array<{ kind: AtlasKind; title: string }> = [
    { kind: "gene", title: "GENES" },
    { kind: "reaction", title: "REACTIONS" },
    { kind: "metabolite", title: "METABOLITES" },
  ];
  return (
    <details className="at-browse bp-frame">
      <Frame />
      <summary>BROWSE AS LIST — every node, keyboard-reachable</summary>
      <div className="at-browse-body">
        <label className="at-control">
          <span className="mr-cat-heading">FILTER</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            placeholder="hexokinase, ENSG…, glucose"
          />
        </label>
        {groups.map(({ kind, title }) => {
          const all = subsystem.nodes.filter(
            (n) =>
              n.kind === kind &&
              (!query ||
                n.label.toLowerCase().includes(query) ||
                n.id.toLowerCase().includes(query)),
          );
          const shown = all.slice(0, BROWSE_CAP);
          return (
            <div key={kind}>
              <div className="mr-section-heading">
                {title} ({all.length})
              </div>
              <div className="at-browse-list">
                {shown.map((n) => (
                  <button
                    key={n.id}
                    className={`at-browse-item${n.id === selectedId ? " active" : ""}`}
                    onClick={() => onSelect(n)}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
              {all.length > BROWSE_CAP ? (
                <p className="at-browse-cap">
                  Showing the first {BROWSE_CAP} of {all.length} — refine the filter.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function formatCoeff(coeff?: number): string {
  return !coeff || coeff === 1 ? "" : `${coeff} `;
}

function SelectedDossier({
  node,
  subsystem,
  index,
  theme,
  onSelect,
}: {
  node: AtlasNode;
  subsystem: AtlasSubsystem;
  index: AtlasIndex;
  theme: ThemeName;
  onSelect: (n: AtlasNode) => void;
}) {
  const color = kindColor(node.kind, theme);
  const byId = useMemo(
    () => new Map(subsystem.nodes.map((n) => [n.id, n])),
    [subsystem],
  );

  return (
    <>
      <div className="mr-dossier-head">
        <span className="mr-dossier-kicker" style={{ color }}>
          {kindTitle(node).toUpperCase()}
        </span>
        <span className="mr-chip pub">{index.model.license}</span>
      </div>
      <h3 className="mr-dossier-title">{node.label}</h3>
      <div className="mr-dossier-sub">{node.id}</div>

      {node.kind === "gene" ? (
        <GeneDetails meta={node.meta as GeneMeta} node={node} subsystem={subsystem} byId={byId} onSelect={onSelect} />
      ) : null}
      {node.kind === "reaction" ? (
        <ReactionDetails meta={node.meta as ReactionMeta} node={node} subsystem={subsystem} byId={byId} onSelect={onSelect} />
      ) : null}
      {node.kind === "metabolite" ? (
        <MetaboliteDetails meta={node.meta as MetaboliteMeta} node={node} subsystem={subsystem} byId={byId} onSelect={onSelect} />
      ) : null}

      <div className="mr-section-heading">PROVENANCE</div>
      <p className="mr-why">
        Human-GEM v{index.model.version} ({index.model.date}), {index.model.license}. A
        curated model assertion — not an experimental measurement.
      </p>
    </>
  );
}

function NodeLinkButton({ node, onSelect }: { node: AtlasNode; onSelect: (n: AtlasNode) => void }) {
  return (
    <button className="at-browse-item" onClick={() => onSelect(node)}>
      {node.label}
    </button>
  );
}

function ExternalId({ label, value, href }: { label: string; value: string; href?: string }) {
  if (!value) return null;
  return (
    <div className="at-idrow">
      <span className="at-idlabel">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {value}
        </a>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}

function GeneDetails({
  meta,
  node,
  subsystem,
  byId,
  onSelect,
}: {
  meta: GeneMeta;
  node: AtlasNode;
  subsystem: AtlasSubsystem;
  byId: Map<string, AtlasNode>;
  onSelect: (n: AtlasNode) => void;
}) {
  const catalyzed = subsystem.links
    .filter((l) => l.kind === "catalyzes" && endpointId(l.source) === node.id)
    .map((l) => byId.get(endpointId(l.target)))
    .filter((n): n is AtlasNode => !!n);
  return (
    <>
      {meta.fullName ? <p className="mr-why at-fullname">{meta.fullName}</p> : null}
      <div className="mr-section-heading">IDENTIFIERS</div>
      <ExternalId
        label="Ensembl"
        value={meta.ensembl}
        href={`https://www.ensembl.org/id/${meta.ensembl}`}
      />
      <ExternalId
        label="UniProt"
        value={meta.uniprot}
        href={meta.uniprot ? `https://www.uniprot.org/uniprotkb/${meta.uniprot.split(";")[0]}` : undefined}
      />
      <ExternalId
        label="Entrez"
        value={meta.entrez}
        href={meta.entrez ? `https://www.ncbi.nlm.nih.gov/gene/${meta.entrez.split(";")[0]}` : undefined}
      />
      <div className="mr-section-heading">CATALYZES ({catalyzed.length})</div>
      <div className="at-browse-list">
        {catalyzed.map((n) => (
          <NodeLinkButton key={n.id} node={n} onSelect={onSelect} />
        ))}
      </div>
    </>
  );
}

function ReactionDetails({
  meta,
  node,
  subsystem,
  byId,
  onSelect,
}: {
  meta: ReactionMeta;
  node: AtlasNode;
  subsystem: AtlasSubsystem;
  byId: Map<string, AtlasNode>;
  onSelect: (n: AtlasNode) => void;
}) {
  // Equation from the full model links — currency metabolites included even
  // when hidden in the scene.
  const substrates: Array<{ node: AtlasNode; coeff?: number }> = [];
  const products: Array<{ node: AtlasNode; coeff?: number }> = [];
  subsystem.links.forEach((l) => {
    if (l.kind === "substrate" && endpointId(l.target) === node.id) {
      const n = byId.get(endpointId(l.source));
      if (n) substrates.push({ node: n, coeff: l.coeff });
    }
    if (l.kind === "product" && endpointId(l.source) === node.id) {
      const n = byId.get(endpointId(l.target));
      if (n) products.push({ node: n, coeff: l.coeff });
    }
  });
  const side = (parts: Array<{ node: AtlasNode; coeff?: number }>) =>
    parts.map((p, i) => (
      <span key={p.node.id}>
        {i > 0 ? " + " : ""}
        {formatCoeff(p.coeff)}
        <NodeLinkButton node={p.node} onSelect={onSelect} />
      </span>
    ));
  return (
    <>
      <div className="mr-section-heading">EQUATION (WHOLE MODEL, TEXT)</div>
      <p className="mr-why at-equation">
        {side(substrates)} {meta.reversible ? "⇌" : "→"} {side(products)}
      </p>
      <div className="mr-section-heading">CATALYSIS</div>
      <p className="mr-why">
        {meta.spontaneous
          ? "No gene association in the model (exchange/pool/artificial construct, or a spontaneous or orphan reaction)."
          : `Gene-reaction rule: ${meta.gpr}`}
      </p>
      {meta.reversible ? <p className="mr-why">Reversible in the model (lb &lt; 0).</p> : null}
      <div className="mr-section-heading">IDENTIFIERS</div>
      {meta.ec.map((ec) => (
        <ExternalId key={ec} label="EC" value={ec} href={`https://enzyme.expasy.org/EC/${ec}`} />
      ))}
      {meta.pmids ? (
        <p className="mr-why">{meta.pmids} PubMed reference(s) attached in the model.</p>
      ) : null}
    </>
  );
}

function MetaboliteDetails({
  meta,
  node,
  subsystem,
  byId,
  onSelect,
}: {
  meta: MetaboliteMeta;
  node: AtlasNode;
  subsystem: AtlasSubsystem;
  byId: Map<string, AtlasNode>;
  onSelect: (n: AtlasNode) => void;
}) {
  const consumedBy: AtlasNode[] = [];
  const producedBy: AtlasNode[] = [];
  subsystem.links.forEach((l) => {
    if (l.kind === "substrate" && endpointId(l.source) === node.id) {
      const n = byId.get(endpointId(l.target));
      if (n) consumedBy.push(n);
    }
    if (l.kind === "product" && endpointId(l.target) === node.id) {
      const n = byId.get(endpointId(l.source));
      if (n) producedBy.push(n);
    }
  });
  return (
    <>
      <div className="mr-section-heading">CHEMISTRY</div>
      <p className="mr-why">
        {meta.formula || "formula not recorded"}
        {meta.charge !== "" ? `, charge ${meta.charge}` : ""} —{" "}
        {meta.compartmentName || meta.compartment}
        {meta.currency ? " · currency metabolite" : ""}
      </p>
      <div className="mr-section-heading">IDENTIFIERS</div>
      <ExternalId
        label="HMDB"
        value={meta.hmdb}
        href={meta.hmdb ? `https://hmdb.ca/metabolites/${meta.hmdb}` : undefined}
      />
      <ExternalId
        label="KEGG"
        value={meta.kegg}
        href={meta.kegg ? `https://www.kegg.jp/entry/${meta.kegg}` : undefined}
      />
      <ExternalId
        label="ChEBI"
        value={meta.chebi}
        href={
          meta.chebi
            ? `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${meta.chebi}`
            : undefined
        }
      />
      <div className="mr-section-heading">CONSUMED BY ({consumedBy.length})</div>
      <div className="at-browse-list">
        {consumedBy.map((n) => (
          <NodeLinkButton key={n.id} node={n} onSelect={onSelect} />
        ))}
      </div>
      <div className="mr-section-heading">PRODUCED BY ({producedBy.length})</div>
      <div className="at-browse-list">
        {producedBy.map((n) => (
          <NodeLinkButton key={n.id} node={n} onSelect={onSelect} />
        ))}
      </div>
    </>
  );
}

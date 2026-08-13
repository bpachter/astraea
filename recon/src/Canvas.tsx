import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Palette } from "./App";
import { routeEdges } from "./routing";
import type { NodeRect, ReconGraph, ThemeName } from "./types";
import { Frame } from "./components";

interface CanvasProps {
  graph: ReconGraph;
  palette: Palette;
  theme: ThemeName;
  selectedId: string;
  onSelect: (id: string) => void;
  showEdgeLabels?: boolean;
  dimOthers?: boolean;
}

export function Canvas({
  graph,
  palette,
  theme,
  selectedId,
  onSelect,
  showEdgeLabels = false,
  dimOthers = true,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = useState<Record<string, NodeRect>>({});

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width) return;
    const next: Record<string, NodeRect> = {};
    canvas.querySelectorAll<HTMLElement>("[data-nid]").forEach((el) => {
      const r = el.getBoundingClientRect();
      next[el.dataset.nid!] = {
        x: r.left - canvasRect.left,
        y: r.top - canvasRect.top,
        w: r.width,
        h: r.height,
      };
    });
    setGeometry(next);
  }, []);

  useEffect(() => {
    const t1 = setTimeout(measure, 80);
    const t2 = setTimeout(measure, 500);
    document.fonts?.ready.then(() => measure());
    let rt: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(measure, 140);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(rt);
      window.removeEventListener("resize", onResize);
    };
  }, [measure]);

  // Theme switches change font rendering subtly; re-measure like the reference.
  useEffect(() => {
    requestAnimationFrame(measure);
  }, [theme, measure]);

  const neighbors = useMemo(() => {
    const set = new Set([selectedId]);
    graph.edges.forEach((e) => {
      if (e.from === selectedId) set.add(e.to);
      if (e.to === selectedId) set.add(e.from);
    });
    return set;
  }, [graph, selectedId]);

  const routed = useMemo(() => routeEdges(graph.edges, geometry), [graph, geometry]);

  return (
    <div className="bp-frame mr-canvas" ref={canvasRef}>
      <Frame />
      <svg className="mr-edges">
        <defs>
          {graph.edgeFamilies.map((f) => (
            <marker
              key={f.key}
              id={`mk-${f.key}-${theme}`}
              viewBox="0 0 10 10"
              refX={8}
              refY={5}
              markerWidth={6.5}
              markerHeight={6.5}
              orient="auto-start-reverse"
            >
              <path
                d="M 0 1 L 9 5 L 0 9"
                fill="none"
                stroke={palette.familyColor(f.key)}
                strokeWidth={1.4}
              />
            </marker>
          ))}
        </defs>
        {routed.map((edge) => {
          const family = palette.familyOf(edge.family);
          const color = palette.familyColor(edge.family);
          const hot = edge.from === selectedId || edge.to === selectedId;
          const width = family?.strokeWidth ?? 1.15;
          return (
            <path
              key={`p${edge.index}`}
              d={edge.d}
              fill="none"
              stroke={color}
              strokeWidth={hot ? width + 0.9 : width}
              strokeDasharray={family?.strokeDasharray ?? undefined}
              strokeLinecap={family?.strokeDasharray === "1.5 3.5" ? "round" : "butt"}
              markerEnd={`url(#mk-${edge.family}-${theme})`}
              opacity={hot ? 1 : selectedId ? 0.3 : 0.68}
            />
          );
        })}
        {routed
          .filter((edge) => showEdgeLabels || edge.from === selectedId || edge.to === selectedId)
          .map((edge) => {
            const hot = edge.from === selectedId || edge.to === selectedId;
            return (
              <text
                key={`t${edge.index}`}
                x={edge.labelX}
                y={edge.labelY + 3}
                textAnchor="middle"
                style={{
                  fill: hot ? palette.familyColor(edge.family) : "var(--mr-muted)",
                  stroke: "var(--color-bg)",
                  strokeWidth: 4,
                  paintOrder: "stroke",
                  fontFamily: "var(--font-body)",
                  fontSize: 9.5,
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  opacity: hot ? 1 : 0.85,
                }}
              >
                {edge.verb}
              </text>
            );
          })}
      </svg>
      {graph.lanes.map((lane, laneIndex) => (
        <div key={lane.index} className={`mr-lane${laneIndex === 0 ? " first" : ""}`}>
          <div className="mr-lane-label">
            <div className="mr-lane-no">{lane.number}</div>
            <div className="mr-lane-title">{lane.title}</div>
            <div className="mr-lane-note">{lane.note}</div>
          </div>
          <div className="mr-lane-nodes">
            {graph.nodes
              .filter((n) => n.lane === lane.index)
              .map((node) => {
                const isSelected = node.id === selectedId;
                const related = neighbors.has(node.id);
                const classColor = palette.classColor(node.class);
                const cls = palette.classOf(node.class);
                const borderColor = isSelected
                  ? classColor
                  : node.confidence === "INF"
                    ? "var(--mr-muted-line)"
                    : "var(--color-divider)";
                return (
                  <button
                    key={node.id}
                    data-nid={node.id}
                    className="mr-node"
                    onClick={() => onSelect(node.id)}
                    style={{
                      borderWidth: "1px 1px 1px 3px",
                      borderColor: `${borderColor} ${borderColor} ${borderColor} ${classColor}`,
                      borderStyle: `${node.confidence === "INF" ? "dashed" : "solid"} `
                        .repeat(3)
                        .concat("solid"),
                      background: isSelected ? "var(--mr-tint)" : "var(--color-bg)",
                      opacity: dimOthers && !related ? 0.38 : 1,
                      ["--mark-color" as string]: isSelected
                        ? classColor
                        : "color-mix(in srgb, var(--color-text) 30%, transparent)",
                    }}
                  >
                    <Frame />
                    <span className="mr-node-top">
                      <span className="mr-node-cls">
                        <span className="mr-node-glyph" style={{ color: classColor }}>
                          {cls?.glyph}
                        </span>
                        {cls?.short}
                      </span>
                      <ConfidenceChip confidence={node.confidence} compact />
                    </span>
                    <span className="mr-node-label">{node.label}</span>
                    <span className="mr-node-sub">{node.subtitle}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConfidenceChip({
  confidence,
  compact = false,
  long = false,
}: {
  confidence: "JD" | "PUB" | "INF";
  compact?: boolean;
  long?: boolean;
}) {
  const cls = confidence === "JD" ? "jd" : confidence === "PUB" ? "pub" : "inf";
  const label = long
    ? confidence === "JD"
      ? "STATED IN JD"
      : confidence === "PUB"
        ? "PUBLIC RECORD"
        : "INFERRED — VERIFY"
    : confidence;
  return <span className={`${compact ? "mr-node-chip" : "mr-chip"} mr-chip ${cls}`}>{label}</span>;
}

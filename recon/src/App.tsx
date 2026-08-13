import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "./Canvas";
import {
  Dossier,
  Footer,
  Header,
  Intro,
  OntologySpec,
  Shortlist,
  Thesis,
} from "./components";
import { Primer } from "./Primer";
import type { EdgeFamily, NodeClass, ReconGraph, ThemeName } from "./types";

export type View = "graph" | "primer";

export interface Palette {
  classColor: (key: string) => string;
  familyColor: (key: string) => string;
  classOf: (key: string) => NodeClass | undefined;
  familyOf: (key: string) => EdgeFamily | undefined;
}

async function loadGraph(): Promise<ReconGraph> {
  const requested = new URLSearchParams(window.location.search).get("graph");
  const candidates = requested ? [requested] : ["metabolon", "sample"];
  for (const name of candidates) {
    const response = await fetch(`${import.meta.env.BASE_URL}graphs/${name}.json`);
    if (response.ok) {
      const type = response.headers.get("content-type") ?? "";
      if (type.includes("json")) return (await response.json()) as ReconGraph;
    }
  }
  throw new Error(
    "No graph instance found. Expected public/graphs/sample.json at minimum.",
  );
}

export default function App() {
  const [graph, setGraph] = useState<ReconGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [view, setView] = useState<View>("graph");
  const [theme, setTheme] = useState<ThemeName>(
    () => (localStorage.getItem("mr-theme") as ThemeName) || "light",
  );

  useEffect(() => {
    loadGraph()
      .then((g) => {
        setGraph(g);
        const preferred = g.nodes.find((n) => n.id === "mlims") ?? g.nodes[0];
        setSelectedId(preferred?.id ?? "");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!graph) return;
    const values = graph.themes[theme];
    const root = document.documentElement;
    root.style.setProperty("--color-bg", values.bg);
    root.style.setProperty("--color-surface", values.surface);
    root.style.setProperty("--color-text", values.text);
    root.style.setProperty("--color-divider", values.divider);
    root.style.setProperty("--mr-accent-text", values.accentText);
    root.style.setProperty("--mr-accent-deep", values.accentDeep);
    root.style.setProperty("--mr-tint", values.tint);
    root.style.setProperty("--mr-muted", values.muted);
    root.style.setProperty("--mr-muted-line", values.mutedLine);
    root.style.setProperty("--mr-scheme", theme);
    document.body.style.background = values.bg;
    localStorage.setItem("mr-theme", theme);
  }, [graph, theme]);

  const palette: Palette = useMemo(() => {
    const classes = new Map(graph?.nodeClasses.map((c) => [c.key, c]) ?? []);
    const families = new Map(graph?.edgeFamilies.map((f) => [f.key, f]) ?? []);
    return {
      classOf: (key) => classes.get(key),
      familyOf: (key) => families.get(key),
      classColor: (key) => {
        const c = classes.get(key);
        return c ? (theme === "light" ? c.colorLight : c.colorDark) : "currentColor";
      },
      familyColor: (key) => {
        const f = families.get(key);
        return f ? (theme === "light" ? f.colorLight : f.colorDark) : "currentColor";
      },
    };
  }, [graph, theme]);

  const select = useCallback((id: string) => setSelectedId(id), []);

  const selectAndScroll = useCallback((id: string) => {
    setView("graph");
    setSelectedId(id);
    requestAnimationFrame(() => {
      const canvas = document.querySelector(".mr-canvas");
      if (canvas) {
        const top = canvas.getBoundingClientRect().top + window.scrollY - 20;
        window.scrollTo({ top, behavior: "smooth" });
      }
    });
  }, []);

  if (error) return <div style={{ padding: 40 }}>{error}</div>;
  if (!graph) return null;

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? graph.nodes[0];

  return (
    <div className="recon-root">
      <Header
        title={graph.meta.title}
        theme={theme}
        onTheme={setTheme}
        view={view}
        onView={setView}
      />
      <div className="mr-container">
        {view === "graph" ? (
          <>
            <Intro graph={graph} palette={palette} theme={theme} />
            <div className="mr-split">
              <Canvas
                graph={graph}
                palette={palette}
                theme={theme}
                selectedId={selected.id}
                onSelect={select}
              />
              <Dossier
                graph={graph}
                palette={palette}
                node={selected}
                onSelect={select}
              />
            </div>
            <OntologySpec graph={graph} palette={palette} />
            <Thesis graph={graph} onJump={selectAndScroll} />
            <Shortlist graph={graph} onJump={selectAndScroll} />
            <Footer disclaimer={graph.meta.disclaimer} />
          </>
        ) : (
          <Primer onJumpToNode={selectAndScroll} />
        )}
      </div>
    </div>
  );
}

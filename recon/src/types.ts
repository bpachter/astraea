export type Confidence = "JD" | "PUB" | "INF";
export type EvidenceSource = "JD" | "WEB" | "GUESS";

export interface ThemeValues {
  bg: string;
  surface: string;
  text: string;
  divider: string;
  accentText: string;
  accentDeep: string;
  tint: string;
  muted: string;
  mutedLine: string;
}

export interface NodeClass {
  key: string;
  short: string;
  glyph: string;
  colorLight: string;
  colorDark: string;
  definition: string;
  memberCount: number;
}

export interface EdgeFamily {
  key: string;
  label: string;
  note: string;
  colorLight: string;
  colorDark: string;
  strokeDasharray: string | null;
  strokeWidth: number;
  verbs: string[];
}

export interface RelationType {
  verb: string;
  meaning: string;
  example: string;
  family: string | null;
}

export interface Lane {
  index: number;
  number: string;
  title: string;
  note: string;
}

export interface Evidence {
  source: EvidenceSource;
  text: string;
}

export interface GraphNode {
  id: string;
  lane: number;
  laneTitle: string;
  class: string;
  confidence: Confidence;
  label: string;
  subtitle: string;
  evidence: Evidence[];
  whyItMatters: string;
  questions: string[];
  undrawnRelation?: string | null;
}

export interface GraphEdge {
  from: string;
  to: string;
  verb: string;
  family: string;
  fromLabel: string;
  toLabel: string;
}

export interface ThesisPlate {
  number: string;
  node: string;
  title: string;
  body: string;
  sayItAs: string;
}

export interface ShortlistQuestion {
  n: number;
  node: string;
  nodeLabel: string;
  question: string;
}

export interface ReconGraph {
  meta: {
    title: string;
    purpose: string;
    confidenceLegend: Record<Confidence, string>;
    disclaimer: string;
    /** Intro overrides; instances without them get the interview-recon defaults. */
    kicker?: string;
    headline?: string;
  };
  themes: { light: ThemeValues; dark: ThemeValues };
  nodeClasses: NodeClass[];
  edgeFamilies: EdgeFamily[];
  relationTypes: RelationType[];
  lanes: Lane[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  operatingThesis: ThesisPlate[];
  shortlistQuestions: ShortlistQuestion[];
}

export type ThemeName = "light" | "dark";

export interface NodeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

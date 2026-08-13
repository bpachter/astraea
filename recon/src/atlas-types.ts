export type AtlasKind = "gene" | "reaction" | "metabolite";

export interface AtlasLayerDef {
  index: number;
  key: string;
  title: string;
  note: string;
}

export interface AtlasSubsystemRow {
  name: string;
  slug: string;
  genes: number;
  reactions: number;
  metabolites: number;
  links: number;
}

export interface AtlasIndex {
  model: {
    id: string;
    name: string;
    version: string;
    date: string;
    sourceUrl: string;
    license: string;
    citation: string;
  };
  totals: {
    metabolites: number;
    reactions: number;
    genes: number;
    subsystems: number;
  };
  layers: AtlasLayerDef[];
  compartments: Record<string, string>;
  subsystems: AtlasSubsystemRow[];
}

export interface GeneMeta {
  ensembl: string;
  uniprot: string;
  entrez: string;
  fullName: string;
}

export interface ReactionMeta {
  ec: string[];
  reversible: boolean;
  gpr: string;
  pmids: number;
  spontaneous: boolean;
  confidence: string | number;
}

export interface MetaboliteMeta {
  formula: string;
  charge: number | string;
  compartment: string;
  compartmentName: string;
  kegg: string;
  hmdb: string;
  chebi: string;
  currency: boolean;
}

export interface AtlasNode {
  id: string;
  kind: AtlasKind;
  layer: 0 | 1 | 2;
  label: string;
  meta: GeneMeta | ReactionMeta | MetaboliteMeta;
  // populated by the force engine / layer pinning
  x?: number;
  y?: number;
  z?: number;
  fz?: number;
}

export interface AtlasLink {
  source: string | AtlasNode;
  target: string | AtlasNode;
  kind: "catalyzes" | "substrate" | "product";
  coeff?: number;
}

export interface AtlasSubsystem {
  name: string;
  slug: string;
  model: { version: string; date: string };
  stats: { genes: number; reactions: number; metabolites: number; links: number };
  nodes: AtlasNode[];
  links: AtlasLink[];
}

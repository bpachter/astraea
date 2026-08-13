"""Build the layered-omics atlas data from Human-GEM.

Parses the Human-GEM genome-scale metabolic model (SysBioChalmers/Human-GEM,
CC-BY-4.0) into per-subsystem layered graphs:

    layer 0  genome      — genes (Ensembl), from GPR rules
    layer 1  catalysis   — enzymatic reactions (the proteome acting; Human-GEM
                           encodes proteins implicitly via gene-reaction rules)
    layer 2  metabolome  — metabolites with compartments and identifiers

Sources are downloaded into --src if missing; derived JSON is emitted to
recon/public/atlas/. Every emitted file carries model version + attribution.

The parser is deliberately a line parser, not PyYAML: the model file is 7.7 MB
of strictly regular RAVEN-exported YAML, and parsing it structurally lets us
fail loudly on any line we do not recognize instead of absorbing a format
change silently.
"""

import argparse
import csv
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

RAW = "https://raw.githubusercontent.com/SysBioChalmers/Human-GEM/main"
SOURCES = {
    "Human-GEM.yml": f"{RAW}/model/Human-GEM.yml",
    "genes.tsv": f"{RAW}/model/genes.tsv",
    "metabolites.tsv": f"{RAW}/model/metabolites.tsv",
}

CITATION = (
    "Robinson, J.L. et al. An atlas of human metabolism. Sci. Signal. 13, "
    "eaaz1482 (2020). Model: Human-GEM, SysBioChalmers, CC-BY-4.0."
)

# Currency metabolites participate in hundreds of reactions and, drawn
# naively, reduce any pathway to a hairball. Standard practice in metabolic
# network visualization is to de-emphasize them; we mark them so the UI can
# hide them by default behind a disclosed toggle.
CURRENCY_NAMES = {
    "H2O", "H+", "ATP", "ADP", "AMP", "Pi", "PPi", "NAD+", "NADH", "NADP+",
    "NADPH", "FAD", "FADH2", "CoA", "CO2", "O2", "H2O2", "NH3", "NH4+",
    "sodium", "K+", "chloride", "phosphate", "diphosphate", "GTP", "GDP",
}

ENSG = re.compile(r"ENSG\d{11}")


def fetch_sources(src: Path):
    src.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        path = src / name
        if path.exists():
            continue
        print(f"downloading {name} from {url} ...")
        urllib.request.urlretrieve(url, path)


def unquote(value: str) -> str:
    value = value.strip()
    if value.startswith('"') and value.endswith('"'):
        value = value[1:-1]
    return value


def parse_model(path: Path):
    """One pass over the YAML; section-aware line parser that fails loudly."""
    meta = {}
    compartments = {}
    metabolites = {}
    reactions = []
    genes = {}

    section = None
    current = None
    in_stoich = False

    def close_current():
        nonlocal current
        if current is None:
            return
        if section == "metabolites":
            metabolites[current["id"]] = current
        elif section == "reactions":
            reactions.append(current)
        elif section == "genes":
            genes[current["id"]] = current.get("name", current["id"])
        current = None

    with path.open(encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\n")
            if line.startswith("- "):
                close_current()
                head = line[2:].split(":", 1)[0]
                section = head if head in ("metabolites", "reactions", "genes") else (
                    "compartments" if head.startswith("compartments") else "meta"
                )
                in_stoich = False
                continue
            if section == "meta":
                m = re.match(r"^\s{4}(\w+): \"?(.*?)\"?$", line)
                if m:
                    meta[m.group(1)] = m.group(2)
                continue
            if section == "compartments":
                m = re.match(r"^\s{4}- (\w+): \"?(.*?)\"?$", line)
                if m:
                    compartments[m.group(1)] = m.group(2)
                continue
            if section not in ("metabolites", "reactions", "genes"):
                continue

            if line.strip() == "- !!omap":
                close_current()
                current = {}
                in_stoich = False
                continue
            if current is None:
                continue

            stoich = re.match(r"^\s{10}- (\S+): (-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$", line)
            if in_stoich and stoich:
                current.setdefault("metabolites", {})[stoich.group(1)] = float(stoich.group(2))
                continue
            if in_stoich and re.match(r"^\s{10}- \S+:", line):
                # A stoichiometric line the float pattern did not match must be
                # a format change — fail loudly, never absorb it as a list item.
                sys.exit(f"unrecognized stoichiometry line: {line!r}")

            field = re.match(r"^\s{6}- (\w+):(.*)$", line)
            if field:
                key, value = field.group(1), field.group(2).strip()
                in_stoich = key == "metabolites"
                if in_stoich:
                    continue
                if value in ("", "!!omap"):
                    current[key] = []
                else:
                    current[key] = unquote(value)
                continue

            item = re.match(r"^\s{10}- \"?(.*?)\"?$", line)
            if item and current:
                last_key = next(reversed(current), None)
                if last_key and isinstance(current[last_key], list):
                    current[last_key].append(item.group(1))
                continue

            if line.strip():
                sys.exit(f"unrecognized line in section {section}: {line!r}")
    close_current()
    return meta, compartments, metabolites, reactions, genes


def load_crosswalks(src: Path):
    gene_x, met_x = {}, {}
    with (src / "genes.tsv").open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            key = unquote(row["genes"])
            gene_x[key] = {
                "symbol": unquote(row.get("geneSymbols") or ""),
                "uniprot": unquote(row.get("geneUniProtID") or ""),
                "entrez": unquote(row.get("geneEntrezID") or ""),
                "fullName": unquote(row.get("geneNames") or ""),
            }
    with (src / "metabolites.tsv").open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            met_x[row["mets"]] = {
                "kegg": row.get("metKEGGID") or "",
                "hmdb": row.get("metHMDBID") or "",
                "chebi": row.get("metChEBIID") or "",
            }
    return gene_x, met_x


def slugify(name: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")


def build(src: Path, out: Path):
    meta, compartments, mets, rxns, genes = parse_model(src / "Human-GEM.yml")
    gene_x, met_x = load_crosswalks(src)

    print(
        f"parsed Human-GEM {meta.get('version')} ({meta.get('date')}): "
        f"{len(mets)} metabolites, {len(rxns)} reactions, {len(genes)} genes, "
        f"{len(compartments)} compartments"
    )

    by_subsystem = defaultdict(list)
    for rxn in rxns:
        by_subsystem[rxn.get("subsystem", "Unassigned")].append(rxn)

    out_subsystems = out / "subsystems"
    out_subsystems.mkdir(parents=True, exist_ok=True)

    index_rows = []
    used_slugs = {}
    for name, subsystem_rxns in sorted(by_subsystem.items()):
        slug = slugify(name)
        if slug in used_slugs:
            # Human-GEM 2.0.0 carries subsystems distinguished only by case
            # ("Pentose Phosphate Pathway" vs "Pentose phosphate pathway").
            # They are distinct in the source, so they stay distinct here —
            # disambiguated deterministically and reported, never overwritten.
            used_slugs[slug] += 1
            print(
                f"WARNING: slug collision '{slug}': {name!r} vs a prior subsystem; "
                f"emitting as '{slug}-{used_slugs[slug]}'"
            )
            slug = f"{slug}-{used_slugs[slug]}"
        else:
            used_slugs[slug] = 1
        nodes, links = [], []
        seen = set()

        def add_node(node):
            if node["id"] not in seen:
                seen.add(node["id"])
                nodes.append(node)

        for rxn in subsystem_rxns:
            rid = rxn["id"]
            ec = rxn.get("eccodes", [])
            ec = [ec] if isinstance(ec, str) else ec
            gpr = rxn.get("gene_reaction_rule", "") or ""
            pmids = len(re.findall(r"PMID:\d+", rxn.get("references", "") or ""))
            reversible = float(rxn.get("lower_bound", 0)) < 0
            add_node({
                "id": rid,
                "kind": "reaction",
                "layer": 1,
                "label": rxn.get("name") or rid,
                "meta": {
                    "ec": ec,
                    "reversible": reversible,
                    "gpr": gpr,
                    "pmids": pmids,
                    "spontaneous": not gpr,
                    "confidence": rxn.get("confidence_score", ""),
                },
            })
            for gene_id in sorted(set(ENSG.findall(gpr))):
                x = gene_x.get(gene_id, {})
                add_node({
                    "id": gene_id,
                    "kind": "gene",
                    "layer": 0,
                    "label": genes.get(gene_id) or x.get("symbol") or gene_id,
                    "meta": {
                        "ensembl": gene_id,
                        "uniprot": x.get("uniprot", ""),
                        "entrez": x.get("entrez", ""),
                        "fullName": x.get("fullName", ""),
                    },
                })
                links.append({"source": gene_id, "target": rid, "kind": "catalyzes"})
            for met_id, coeff in rxn.get("metabolites", {}).items():
                met = mets.get(met_id)
                if met is None:
                    sys.exit(f"reaction {rid} references unknown metabolite {met_id}")
                x = met_x.get(met_id, {})
                met_name = met.get("name", met_id)
                add_node({
                    "id": met_id,
                    "kind": "metabolite",
                    "layer": 2,
                    "label": met_name,
                    "meta": {
                        "formula": met.get("formula", ""),
                        "charge": met.get("charge", ""),
                        "compartment": met.get("compartment", ""),
                        "compartmentName": compartments.get(met.get("compartment", ""), ""),
                        "kegg": x.get("kegg", ""),
                        "hmdb": x.get("hmdb", ""),
                        "chebi": x.get("chebi", ""),
                        "currency": met_name in CURRENCY_NAMES,
                    },
                })
                if coeff < 0:
                    links.append({"source": met_id, "target": rid, "kind": "substrate", "coeff": -coeff})
                else:
                    links.append({"source": rid, "target": met_id, "kind": "product", "coeff": coeff})

        stats = {
            "genes": sum(1 for n in nodes if n["kind"] == "gene"),
            "reactions": sum(1 for n in nodes if n["kind"] == "reaction"),
            "metabolites": sum(1 for n in nodes if n["kind"] == "metabolite"),
            "links": len(links),
        }
        payload = {
            "name": name,
            "slug": slug,
            "model": {"version": meta.get("version"), "date": meta.get("date")},
            "stats": stats,
            "nodes": nodes,
            "links": links,
        }
        (out_subsystems / f"{slug}.json").write_text(
            json.dumps(payload, separators=(",", ":")), encoding="utf-8"
        )
        index_rows.append({"name": name, "slug": slug, **stats})

    index = {
        "model": {
            "id": meta.get("id"),
            "name": meta.get("name"),
            "version": meta.get("version"),
            "date": meta.get("date"),
            "sourceUrl": meta.get("sourceUrl"),
            "license": "CC-BY-4.0",
            "citation": CITATION,
        },
        "totals": {
            "metabolites": len(mets),
            "reactions": len(rxns),
            "genes": len(genes),
            "subsystems": len(index_rows),
        },
        "layers": [
            {"index": 0, "key": "genome", "title": "GENOME", "note": "genes from gene-reaction rules (Ensembl)"},
            {"index": 1, "key": "catalysis", "title": "REACTIONS", "note": "enzyme-catalyzed steps carry gene-reaction rules (the proteome acting); exchange, pool, and artificial entries are modeling constructs, not catalysis"},
            {"index": 2, "key": "metabolome", "title": "METABOLOME", "note": "metabolites with compartments and identifiers"},
        ],
        "compartments": compartments,
        "subsystems": index_rows,
    }
    (out / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")

    total_bytes = sum(f.stat().st_size for f in out_subsystems.glob("*.json"))
    print(f"emitted {len(index_rows)} subsystems, {total_bytes / 1e6:.1f} MB + index.json")
    biggest = sorted(index_rows, key=lambda r: r["links"], reverse=True)[:5]
    for row in biggest:
        print(f"  largest: {row['name']} — {row['links']} links")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, required=True, help="dir for Human-GEM source files")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "public" / "atlas")
    args = parser.parse_args()
    fetch_sources(args.src)
    build(args.src, args.out)

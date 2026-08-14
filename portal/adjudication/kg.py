"""Read-only connector to a live Thessa knowledge graph.

Astraea NEVER writes to the graph. Connections are opened with SQLite's
read-only URI mode, decisions leave through `manage.py export_decisions` as a
JSON log, and the apply step belongs to the graph's own governed sweeps.

The public repo works without any graph present: everything here raises
KgUnavailable with a plain explanation instead of degrading into an empty
result that looks like a real answer.
"""

import os
import sqlite3

DEFAULT_KG_DB = "C:/dev/thessa/server/data/space_kg.db"

# Mirror of the graph's canonical node-referencing column list (kgNodeRefs.ts).
# rehome_only marks RECORDS (contracts, drafts, audit trails) — evidence, not
# graph structure — excluded from live-edge substance counts. Like the source
# list, entries are filtered to columns that exist in the connected database,
# so an older backup degrades to "not scanned", never to an error.
NODE_REF_COLS = [
    ("edge_supplies", "supplier_id", False),
    ("edge_supplies", "customer_id", False),
    ("edge_makes", "org_id", False),
    ("edge_makes", "target_id", False),
    ("edge_depends_on", "dependent_id", False),
    ("edge_depends_on", "dependency_id", False),
    ("edge_has_capability", "org_id", False),
    ("edge_has_capability", "capability_id", False),
    ("edge_serves", "company_id", False),
    ("edge_competes", "company_a_id", False),
    ("edge_competes", "company_b_id", False),
    ("edge_produces", "org_id", False),
    ("edge_produces", "material_id", False),
    ("org_lineage", "node_id", False),
    ("edge_reports_segment", "company_id", False),
    ("edge_reports_segment", "segment_id", False),
    ("edge_product_revenue", "company_id", False),
    ("edge_product_revenue", "product_id", False),
    ("edge_geo", "subject_id", False),
    ("edge_geo", "object_id", False),
    ("edge_control", "subject_id", False),
    ("edge_control", "object_id", False),
    ("edge_influence", "subject_id", False),
    ("edge_influence", "object_id", False),
    ("company_concentration", "company_id", False),
    ("vehicles", "org_id", False),
    ("ontology_proposal_items", "ref_id", False),
    ("node_identity", "node_id", False),
    ("federal_contracts", "recipient_id", True),
    ("political_contributions", "company_id", True),
    ("edge_audits", "supplier_id", True),
    ("edge_audits", "customer_id", True),
    ("job_postings", "company_id", True),
    ("draft_company_enrichments", "company_id", True),
    ("draft_edge_supplies", "supplier_id", True),
    ("draft_edge_supplies", "customer_id", True),
]


class KgUnavailable(Exception):
    pass


def kg_path():
    return os.environ.get("THESSA_KG_DB", DEFAULT_KG_DB)


def open_kg(path=None):
    path = path or kg_path()
    if not os.path.exists(path):
        raise KgUnavailable(
            f"No knowledge graph at {path}. Set THESSA_KG_DB to a live graph, "
            "or stay on the seeded public demo — Astraea works without one."
        )
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def _table_columns(con, table):
    try:
        return {r["name"] for r in con.execute(f"PRAGMA table_info('{table}')")}
    except sqlite3.Error:
        return set()


def node_ref_cols(con, include_rehome_only=True):
    """The authoritative list, filtered to what THIS database actually has."""
    return [
        (table, col, rehome)
        for table, col, rehome in NODE_REF_COLS
        if (include_rehome_only or not rehome) and col in _table_columns(con, table)
    ]


def _live_filter(con, table):
    return " AND retired_at IS NULL" if "retired_at" in _table_columns(con, table) else ""


def census(con):
    """Node types and relation types with live counts, from the actual schema."""
    node_types = [
        {"name": r["node_type"] or "(untyped)", "source_table": "companies", "live_count": r["n"]}
        for r in con.execute(
            "SELECT node_type, COUNT(*) n FROM companies GROUP BY node_type ORDER BY n DESC"
        )
    ]
    for table in ("programs", "satellites", "materials", "missions", "politicians"):
        if _table_columns(con, table):
            n = con.execute(f"SELECT COUNT(*) FROM '{table}'").fetchone()[0]
            node_types.append({"name": table, "source_table": table, "live_count": n})

    edge_tables = [
        r["name"]
        for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'edge_%' "
            "AND name NOT IN ('edge_audits')"
        )
    ]
    relations = []
    for table in edge_tables:
        n = con.execute(f"SELECT COUNT(*) FROM '{table}' WHERE 1=1{_live_filter(con, table)}").fetchone()[0]
        refs = [f"{t}.{c}" for t, c, _ in node_ref_cols(con) if t == table]
        relations.append(
            {"name": table.removeprefix("edge_"), "source_table": table, "live_count": n, "ref_cols": refs}
        )
    return node_types, relations


def substance_for(con, node_ids):
    """GraphSubstance per node id, counted across every referencing table.

    Live edges exclude rehome-only RECORD tables and retired rows; federal
    contracts are counted (and summed) separately because they are the
    substance signal that saved $134.7B of orphans from being called noise.
    """
    ids = [i for i in set(node_ids) if i]
    result = {
        i: {
            "live_edges": 0,
            "federal_contracts": 0,
            "federal_contract_usd": 0.0,
            "has_ticker": False,
            "has_intel_id": False,
            "has_lei": False,
        }
        for i in ids
    }
    if not ids:
        return result

    placeholders = ",".join("?" for _ in ids)
    for table, col, _rehome in node_ref_cols(con, include_rehome_only=False):
        rows = con.execute(
            f"SELECT {col} k, COUNT(*) n FROM '{table}' "
            f"WHERE {col} IN ({placeholders}){_live_filter(con, table)} GROUP BY {col}",
            ids,
        )
        for r in rows:
            result[r["k"]]["live_edges"] += r["n"]

    for r in con.execute(
        f"SELECT recipient_id k, COUNT(*) n, COALESCE(SUM(value_usd), 0) usd "
        f"FROM federal_contracts WHERE recipient_id IN ({placeholders}) GROUP BY recipient_id",
        ids,
    ):
        result[r["k"]]["federal_contracts"] = r["n"]
        result[r["k"]]["federal_contract_usd"] = float(r["usd"])

    for r in con.execute(
        f"SELECT id, ticker, intel_id, lei FROM companies WHERE id IN ({placeholders})", ids
    ):
        result[r["id"]]["has_ticker"] = bool(r["ticker"])
        result[r["id"]]["has_intel_id"] = bool(r["intel_id"])
        result[r["id"]]["has_lei"] = bool(r["lei"])

    return result


def company_names(con, node_ids):
    ids = [i for i in set(node_ids) if i]
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    return {
        r["id"]: r["name"]
        for r in con.execute(f"SELECT id, name FROM companies WHERE id IN ({placeholders})", ids)
    }

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from adjudication import kg
from adjudication.models import EdgeProposal, KgNodeType, KgRelationType, TypeProposal


class Command(BaseCommand):
    help = (
        "Import the live knowledge graph's pending work into the adjudication "
        "queues, read-only: the ontology census, pending draft supply edges, and "
        "node retype proposals with per-node substance."
    )

    def add_arguments(self, parser):
        parser.add_argument("--db", default=None, help="Path to the KG (default: THESSA_KG_DB)")

    def handle(self, *args, **options):
        try:
            con = kg.open_kg(options["db"])
        except kg.KgUnavailable as exc:
            raise CommandError(str(exc))

        now = timezone.now()

        node_types, relations = kg.census(con)
        KgNodeType.objects.all().delete()
        KgNodeType.objects.bulk_create(KgNodeType(captured_at=now, **row) for row in node_types)
        KgRelationType.objects.all().delete()
        KgRelationType.objects.bulk_create(KgRelationType(captured_at=now, **row) for row in relations)
        self.stdout.write(
            f"Census: {len(node_types)} node types, {len(relations)} relation types."
        )

        drafts = con.execute(
            "SELECT id, supplier_id, customer_id, component_desc, confidence, replaceability, "
            "disclosed_value, disclosed_currency, disclosed_basis, contract_value_usd, "
            "rationale, contributor, sources_json, status "
            "FROM draft_edge_supplies WHERE status = 'pending' ORDER BY id"
        ).fetchall()
        names = kg.company_names(
            con, [r["supplier_id"] for r in drafts] + [r["customer_id"] for r in drafts]
        )
        created_edges = 0
        for r in drafts:
            _, was_created = EdgeProposal.objects.get_or_create(
                kg_draft_id=r["id"],
                defaults={
                    "supplier_id": r["supplier_id"],
                    "supplier_name": names.get(r["supplier_id"], ""),
                    "customer_id": r["customer_id"],
                    "customer_name": names.get(r["customer_id"], ""),
                    "component_desc": r["component_desc"] or "",
                    "confidence": r["confidence"],
                    "replaceability": r["replaceability"],
                    "disclosed_value": r["disclosed_value"],
                    "disclosed_currency": r["disclosed_currency"] or "",
                    "disclosed_basis": r["disclosed_basis"] or "",
                    "contract_value_usd": r["contract_value_usd"],
                    "rationale": r["rationale"] or "",
                    "contributor": r["contributor"] or "",
                    "sources": r["sources_json"],
                    "kg_status": r["status"],
                },
            )
            created_edges += was_created
        self.stdout.write(
            f"Edges: {created_edges} imported, {len(drafts) - created_edges} already present "
            f"({len(drafts)} pending in the live queue)."
        )

        items = con.execute(
            "SELECT id, ref_id, name, current_type, proposed_type, reason, source, confidence, status "
            "FROM ontology_proposal_items "
            "WHERE kind = 'node' AND status IN ('proposed', 'review') ORDER BY id"
        ).fetchall()
        substance = kg.substance_for(con, [r["ref_id"] for r in items])
        created_types = 0
        for r in items:
            _, was_created = TypeProposal.objects.get_or_create(
                kg_item_id=r["id"],
                defaults={
                    "ref_id": r["ref_id"],
                    "name": r["name"] or "",
                    "current_type": r["current_type"] or "",
                    "proposed_type": r["proposed_type"] or "",
                    "reason": r["reason"] or "",
                    "source": r["source"] or "",
                    "confidence": r["confidence"],
                    "kg_status": r["status"],
                    "substance": substance.get(r["ref_id"], {}),
                },
            )
            created_types += was_created
        self.stdout.write(
            f"Retypes: {created_types} imported, {len(items) - created_types} already present "
            f"({len(items)} proposed/review in the live queue)."
        )
        con.close()

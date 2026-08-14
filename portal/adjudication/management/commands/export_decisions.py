import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from adjudication.models import EdgeProposal, MergeProposal, Proposal, TypeProposal


class Command(BaseCommand):
    help = (
        "Export adjudicated decisions as a JSON log. Astraea never writes to the "
        "live graph — the apply step belongs to the graph's own governed sweeps, "
        "dry-run by default, with this file as the input."
    )

    def handle(self, *args, **options):
        now = timezone.now()
        out = {
            "exported_at": now.isoformat(),
            "tool": "astraea",
            "note": "Decisions only; application is a separate, reversible, logged step.",
            "segment_proposals": [
                {
                    "company": p.company,
                    "fiscal_year": p.fiscal_year,
                    "decision": p.status,
                    "gate_status": p.gate_status,
                    "reviewed_by": p.reviewed_by,
                    "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
                }
                for p in Proposal.objects.filter(status__in=["approved", "rejected"])
            ],
            "edge_proposals": [
                {
                    "kg_draft_id": e.kg_draft_id,
                    "decision": e.status,
                    "gate_status": e.gate_status,
                    "reviewed_by": e.reviewed_by,
                    "reviewed_at": e.reviewed_at.isoformat() if e.reviewed_at else None,
                }
                for e in EdgeProposal.objects.filter(status__in=["approved", "rejected"])
            ],
            "type_proposals": [
                {
                    "kg_item_id": t.kg_item_id,
                    "ref_id": t.ref_id,
                    "decision": t.status,
                    "gate_status": t.gate_status,
                    "reviewed_by": t.reviewed_by,
                    "reviewed_at": t.reviewed_at.isoformat() if t.reviewed_at else None,
                }
                for t in TypeProposal.objects.filter(status__in=["approved", "rejected"])
            ],
            "merge_proposals": [
                {
                    "survivor": m.survivor_name,
                    "loser": m.loser_name,
                    "decision": m.status,
                    "gate_status": m.gate_status,
                    "demo": m.demo,
                    "reviewed_by": m.reviewed_by,
                    "reviewed_at": m.reviewed_at.isoformat() if m.reviewed_at else None,
                }
                for m in MergeProposal.objects.filter(status__in=["approved", "rejected"])
            ],
        }
        path = Path(settings.BASE_DIR).parent / "data" / f"decisions-{now:%Y%m%d-%H%M%S}.json"
        path.write_text(json.dumps(out, indent=2), encoding="utf-8")
        counts = {k: len(v) for k, v in out.items() if isinstance(v, list)}
        self.stdout.write(self.style.SUCCESS(f"Wrote {path} — {counts}"))

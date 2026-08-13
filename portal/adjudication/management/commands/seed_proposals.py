import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from adjudication.models import MergeProposal, Proposal

SEED_DIR = Path(settings.BASE_DIR).parent / "data" / "seed"


class Command(BaseCommand):
    help = "Load the seeded public-data proposals and demo merges into the adjudication queues."

    def handle(self, *args, **options):
        proposals_path = SEED_DIR / "proposals.json"
        if not proposals_path.exists():
            raise CommandError(f"Seed file not found: {proposals_path}")
        records = json.loads(proposals_path.read_text(encoding="utf-8"))

        created, existing = 0, 0
        for record in records:
            _, was_created = Proposal.objects.get_or_create(
                company=record["company"],
                fiscal_year=record["fiscal_year"],
                defaults={
                    "payload": record["payload"],
                    "proposed_by": record.get("proposed_by", "extraction-flywheel"),
                    "citation_check": record.get("citation_check", ""),
                    "synthetic": record.get("synthetic", False),
                    "source_url": record.get("source_url", ""),
                    "source_note": record.get("source_note", ""),
                },
            )
            created += was_created
            existing += not was_created
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {created} proposal(s); {existing} already present (left untouched)."
            )
        )

        merges_path = SEED_DIR / "merges.json"
        if merges_path.exists():
            merge_created = 0
            for record in json.loads(merges_path.read_text(encoding="utf-8")):
                _, was_created = MergeProposal.objects.get_or_create(
                    survivor_name=record["survivor_name"],
                    loser_name=record["loser_name"],
                    defaults={
                        "shared_identity": record.get("shared_identity", False),
                        "survivor_substance": record.get("survivor_substance", {}),
                        "loser_substance": record.get("loser_substance", {}),
                        "note": record.get("note", ""),
                        "demo": record.get("demo", True),
                    },
                )
                merge_created += was_created
            self.stdout.write(self.style.SUCCESS(f"Seeded {merge_created} demo merge(s)."))

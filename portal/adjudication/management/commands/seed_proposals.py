import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from adjudication.models import Proposal

SEED_PATH = Path(settings.BASE_DIR).parent / "data" / "seed" / "proposals.json"


class Command(BaseCommand):
    help = "Load the seeded public-data proposal set into the adjudication queue."

    def handle(self, *args, **options):
        if not SEED_PATH.exists():
            raise CommandError(f"Seed file not found: {SEED_PATH}")
        records = json.loads(SEED_PATH.read_text(encoding="utf-8"))

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

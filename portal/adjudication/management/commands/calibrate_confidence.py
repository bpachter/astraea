import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from adjudication.calibration import calibrate
from adjudication.kg import KgUnavailable, open_kg


class Command(BaseCommand):
    help = (
        "Fit the split-conformal confidence calibration from the live graph's "
        "adjudicated draft edges (verified vs rejected), and write the table "
        "for both the portal (data/calibration.json) and the .NET gate "
        "(gate/Astraea.Gate/calibration.json). Aggregates only — no entities."
    )

    def add_arguments(self, parser):
        parser.add_argument("--bins", type=int, default=10)

    def handle(self, *args, **options):
        try:
            con = open_kg()
        except KgUnavailable as exc:
            raise CommandError(str(exc))
        pairs = [
            (row["confidence"], row["status"] == "verified")
            for row in con.execute(
                "SELECT confidence, status FROM draft_edge_supplies "
                "WHERE status IN ('verified', 'rejected') AND confidence IS NOT NULL"
            )
        ]
        con.close()
        if len(pairs) < options["bins"] * 2:
            raise CommandError(
                f"Only {len(pairs)} adjudicated drafts with confidence — refusing to "
                "fit a table that would be noise. Absence is honest."
            )

        table = calibrate(pairs, bins=options["bins"])
        repo_root = Path(settings.BASE_DIR).parent
        targets = [
            repo_root / "data" / "calibration.json",
            repo_root / "gate" / "Astraea.Gate" / "calibration.json",
        ]
        payload = json.dumps(table, indent=1)
        for target in targets:
            target.write_text(payload, encoding="utf-8")

        self.stdout.write(self.style.SUCCESS(
            f"Calibrated from {table['source_n']} adjudicated drafts "
            f"({options['bins']} bins); validation max gap "
            f"{table['validation']['max_abs_gap']} over {table['validation']['n']} held-out."
        ))
        for row in table["bins"]:
            self.stdout.write(
                f"  raw ≤ {row['raw_hi']:<6} → calibrated {row['calibrated']:<7} (n={row['n']})"
            )
        self.stdout.write(f"Wrote: {', '.join(str(t) for t in targets)}")

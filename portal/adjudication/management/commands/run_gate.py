from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from adjudication.gate import GateUnreachable, call_gate
from adjudication.models import EdgeProposal, MergeProposal, TypeProposal

QUEUES = {
    "edges": EdgeProposal,
    "retypes": TypeProposal,
    "merges": MergeProposal,
}


class Command(BaseCommand):
    help = (
        "Run the .NET ontology gate over every pending item in the KG-backed "
        "queues and attach named verdicts. Idempotent; re-gating is safe."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--queue", choices=[*QUEUES, "all"], default="all",
            help="Which queue to gate (default: all)",
        )

    def handle(self, *args, **options):
        selected = QUEUES if options["queue"] == "all" else {options["queue"]: QUEUES[options["queue"]]}
        for name, model in selected.items():
            pending = model.objects.filter(status__in=["pending", "gated"])
            verdicts = Counter()
            for proposal in pending.iterator():
                try:
                    verdict = call_gate(proposal.GATE_PATH, proposal.gate_request_body)
                except GateUnreachable as exc:
                    raise CommandError(str(exc))
                proposal.gate_status = verdict["status"]
                proposal.gate_detail = verdict["detail"]
                proposal.gate_checked_at = timezone.now()
                if proposal.status == proposal.STATUS_PENDING:
                    proposal.status = proposal.STATUS_GATED
                proposal.save()
                verdicts[verdict["status"]] += 1
            summary = ", ".join(f"{status}: {n}" for status, n in verdicts.most_common()) or "queue empty"
            self.stdout.write(self.style.SUCCESS(f"{name}: {summary}"))

import os

from django.core.management.base import BaseCommand

from adjudication.models import Proposal

PROMPT = """You are an independent citation checker for a knowledge graph whose \
value is that its numbers are true. You see only the proposal below — not the \
extractor's reasoning. In at most three sentences: say whether the segment rows \
plausibly belong to one reporting dimension of one filing, whether the sum can \
tie to the consolidated figure, and anything a human reviewer should look at \
before approving. Be concrete and skeptical; a wrong number is worse than no number.

Proposal:
{proposal}
"""


class Command(BaseCommand):
    help = (
        "Generate an independent citation-check summary for proposals that lack one, "
        "using the Anthropic API. Requires ANTHROPIC_API_KEY; without it, this "
        "command explains itself and exits rather than failing silently."
    )

    def handle(self, *args, **options):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            self.stdout.write(
                self.style.WARNING(
                    "ANTHROPIC_API_KEY is not set — no summaries generated. The seed "
                    "data ships with precomputed summaries so the demo works without "
                    "a key; set the key to regenerate them live."
                )
            )
            return

        try:
            import anthropic
        except ImportError:
            self.stderr.write("The 'anthropic' package is not installed (pip install anthropic).")
            return

        client = anthropic.Anthropic(api_key=api_key)
        model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
        pending = Proposal.objects.filter(citation_check="")
        if not pending.exists():
            self.stdout.write("Every proposal already carries a citation check.")
            return

        for proposal in pending:
            message = client.messages.create(
                model=model,
                max_tokens=300,
                messages=[
                    {
                        "role": "user",
                        "content": PROMPT.format(proposal=proposal.gate_request_body),
                    }
                ],
            )
            proposal.citation_check = message.content[0].text.strip()
            proposal.save(update_fields=["citation_check"])
            self.stdout.write(self.style.SUCCESS(f"Checked {proposal}."))

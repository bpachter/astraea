from django.db import models


class Proposal(models.Model):
    """One extracted set of segment revenue facts awaiting adjudication.

    Lifecycle: pending -> gated (deterministic verdict attached) -> approved or
    rejected by a human reviewer. Approval is refused unless the gate verdict
    is publishable; absence is honest, a plausible wrong figure is not.
    """

    STATUS_PENDING = "pending"
    STATUS_GATED = "gated"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_GATED, "Gated"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    company = models.CharField(max_length=200)
    fiscal_year = models.IntegerField()
    # {"consolidated_revenue_usd": int|null, "segments": [{"name", "revenue_usd", "kind"}]}
    # Revenue is whole USD; a scale riding in a column is a unit bug one layer down.
    payload = models.JSONField()
    proposed_by = models.CharField(max_length=100, default="extraction-flywheel")
    citation_check = models.TextField(
        blank=True,
        help_text="Independent citation-check summary produced by an agent that "
        "sees only the proposal and its source, never the extractor's reasoning.",
    )
    synthetic = models.BooleanField(
        default=False,
        help_text="True for demonstration cases that model a failure mode; "
        "never mixed with real filings undeclared.",
    )
    source_url = models.URLField(blank=True)
    source_note = models.CharField(max_length=300, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    gate_status = models.CharField(
        max_length=40,
        blank=True,
        help_text="Verdict from the .NET gate: publishable, or a named failure mode.",
    )
    gate_detail = models.TextField(blank=True)
    gate_delta_pct = models.FloatField(null=True, blank=True)
    gate_segment_sum_usd = models.DecimalField(
        max_digits=20, decimal_places=2, null=True, blank=True
    )
    gate_checked_at = models.DateTimeField(null=True, blank=True)

    reviewed_by = models.CharField(max_length=150, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["company", "-fiscal_year"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "fiscal_year"], name="one_proposal_per_company_year"
            )
        ]

    def __str__(self):
        return f"{self.company} FY{self.fiscal_year}"

    @property
    def gate_request_body(self):
        """The proposal as the gate's ExtractionProposal contract expects it."""
        return {
            "company": self.company,
            "fiscal_year": self.fiscal_year,
            "consolidated_revenue_usd": self.payload.get("consolidated_revenue_usd"),
            "segments": self.payload.get("segments", []),
        }

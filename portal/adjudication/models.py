from django.db import models


class GovernedProposal(models.Model):
    """The governance block every adjudicable thing shares: a gate verdict a
    human cannot bypass. Subclasses define what is being judged and which gate
    endpoint judges it (GATE_PATH + gate_request_body)."""

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

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    gate_status = models.CharField(max_length=60, blank=True)
    gate_detail = models.TextField(blank=True)
    gate_checked_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.CharField(max_length=150, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    GATE_PATH = ""  # subclasses set e.g. "/validate-edge"

    class Meta:
        abstract = True

    @property
    def can_approve(self):
        return self.status == self.STATUS_GATED and self.gate_status == "publishable"


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


class EdgeProposal(GovernedProposal):
    """A proposed relationship edge imported from the live KG's draft queue
    (draft_edge_supplies), judged against ontology law before a human sees it."""

    GATE_PATH = "/validate-edge"

    kg_draft_id = models.IntegerField(unique=True)
    edge_kind = models.CharField(max_length=30, default="supplies")
    supplier_id = models.CharField(max_length=64)
    supplier_name = models.CharField(max_length=300, blank=True)
    customer_id = models.CharField(max_length=64)
    customer_name = models.CharField(max_length=300, blank=True)
    component_desc = models.TextField(blank=True)
    confidence = models.FloatField(null=True, blank=True)
    replaceability = models.IntegerField(null=True, blank=True)
    disclosed_value = models.FloatField(null=True, blank=True)
    disclosed_currency = models.CharField(max_length=8, blank=True)
    disclosed_basis = models.CharField(max_length=60, blank=True)
    contract_value_usd = models.FloatField(null=True, blank=True)
    rationale = models.TextField(blank=True)
    contributor = models.CharField(max_length=100, blank=True)
    sources = models.JSONField(null=True, blank=True)
    kg_status = models.CharField(max_length=30, blank=True)

    class Meta:
        ordering = ["kg_draft_id"]

    def __str__(self):
        return f"{self.supplier_name or self.supplier_id} → {self.customer_name or self.customer_id}"

    @property
    def gate_request_body(self):
        return {
            "edge_kind": self.edge_kind,
            "supplier_id": self.supplier_id,
            "customer_id": self.customer_id,
            "target_id": None,
            "target_kind": None,
            "existing_maker_count": None,
            "component_desc": self.component_desc,
            "confidence": self.confidence,
            "disclosed_value": self.disclosed_value,
            "disclosed_currency": self.disclosed_currency or None,
            "contract_value_usd": self.contract_value_usd,
        }


class TypeProposal(GovernedProposal):
    """A proposed node retype imported from ontology_proposal_items. The gate
    refuses demotions of nodes that hold substance — provenance beats name shape."""

    GATE_PATH = "/validate-retype"

    kg_item_id = models.IntegerField(unique=True)
    ref_id = models.CharField(max_length=64)
    name = models.CharField(max_length=300)
    current_type = models.CharField(max_length=60, blank=True)
    proposed_type = models.CharField(max_length=60, blank=True)
    reason = models.TextField(blank=True)
    source = models.CharField(max_length=60, blank=True)
    confidence = models.FloatField(null=True, blank=True)
    kg_status = models.CharField(max_length=30, blank=True)
    # {live_edges, federal_contracts, federal_contract_usd, has_ticker, has_intel_id, has_lei}
    substance = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["kg_item_id"]

    def __str__(self):
        return f"{self.name}: {self.current_type or '?'} → {self.proposed_type or '?'}"

    @property
    def gate_request_body(self):
        return {
            "name": self.name,
            "current_type": self.current_type or None,
            "proposed_type": self.proposed_type or None,
            "source": self.source or "rule",
            "substance": self.substance,
        }


class MergeProposal(GovernedProposal):
    """A proposed node merge. A merge deletes the loser's name — there is no
    alias table — so the gate demands substance-ranked direction and hard
    identity evidence before a human may even consider it."""

    GATE_PATH = "/validate-merge"

    survivor_id = models.CharField(max_length=64, blank=True)
    survivor_name = models.CharField(max_length=300)
    loser_id = models.CharField(max_length=64, blank=True)
    loser_name = models.CharField(max_length=300)
    shared_identity = models.BooleanField(
        default=False, help_text="Same LEI or intel_id resolved on both nodes."
    )
    survivor_substance = models.JSONField(default=dict, blank=True)
    loser_substance = models.JSONField(default=dict, blank=True)
    note = models.TextField(blank=True)
    demo = models.BooleanField(default=False, help_text="Seeded demonstration case.")

    def __str__(self):
        return f"{self.loser_name} ⇒ {self.survivor_name}"

    @property
    def gate_request_body(self):
        return {
            "survivor_name": self.survivor_name,
            "loser_name": self.loser_name,
            "survivor": self.survivor_substance,
            "loser": self.loser_substance,
            "shared_identity": self.shared_identity,
        }


class KgNodeType(models.Model):
    """Census row: one node type as it exists in the live graph right now."""

    name = models.CharField(max_length=100)
    source_table = models.CharField(max_length=100)
    live_count = models.IntegerField()
    captured_at = models.DateTimeField()

    class Meta:
        ordering = ["-live_count"]
        unique_together = [("name", "source_table")]

    def __str__(self):
        return f"{self.name} ({self.live_count})"


class KgRelationType(models.Model):
    """Census row: one edge table, its live count, and its node-referencing
    columns — enumerated from the schema, never hand-written."""

    name = models.CharField(max_length=100, unique=True)
    source_table = models.CharField(max_length=100)
    live_count = models.IntegerField()
    ref_cols = models.JSONField(default=list)
    captured_at = models.DateTimeField()

    class Meta:
        ordering = ["-live_count"]

    def __str__(self):
        return f"{self.name} ({self.live_count})"

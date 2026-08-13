import json

from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html

from .gate import GateUnreachable, reconcile
from .models import Proposal

STATUS_COLORS = {
    Proposal.STATUS_PENDING: "#8a8a8a",
    Proposal.STATUS_GATED: "#2f6fb5",
    Proposal.STATUS_APPROVED: "#1f7a33",
    Proposal.STATUS_REJECTED: "#8a2f2f",
}


def badge(text, color):
    return format_html(
        '<span style="background:{};color:#fff;padding:2px 8px;border-radius:10px;'
        'font-size:11px;letter-spacing:.4px;">{}</span>',
        color,
        text,
    )


@admin.register(Proposal)
class ProposalAdmin(admin.ModelAdmin):
    list_display = (
        "company",
        "fiscal_year",
        "status_badge",
        "gate_badge",
        "delta",
        "synthetic",
        "proposed_by",
        "reviewed_by",
    )
    list_filter = ("status", "gate_status", "synthetic")
    search_fields = ("company",)
    actions = ("run_gate", "approve", "reject")
    readonly_fields = (
        "status",
        "gate_status",
        "gate_detail",
        "gate_delta_pct",
        "gate_segment_sum_usd",
        "gate_checked_at",
        "reviewed_by",
        "reviewed_at",
        "created_at",
        "payload_pretty",
    )
    fieldsets = (
        ("Proposal", {"fields": ("company", "fiscal_year", "proposed_by", "synthetic")}),
        ("Facts", {"fields": ("payload_pretty",)}),
        ("Provenance", {"fields": ("source_url", "source_note", "citation_check")}),
        (
            "Gate verdict",
            {
                "fields": (
                    "status",
                    "gate_status",
                    "gate_detail",
                    "gate_delta_pct",
                    "gate_segment_sum_usd",
                    "gate_checked_at",
                )
            },
        ),
        ("Review", {"fields": ("reviewed_by", "reviewed_at", "created_at")}),
    )

    @admin.display(description="status")
    def status_badge(self, obj):
        return badge(obj.status, STATUS_COLORS.get(obj.status, "#555"))

    @admin.display(description="gate verdict")
    def gate_badge(self, obj):
        if not obj.gate_status:
            return badge("not run", "#555")
        if obj.gate_status == "publishable":
            return badge("publishable", "#1f7a33")
        return badge(obj.gate_status, "#a65b1f")

    @admin.display(description="delta")
    def delta(self, obj):
        if obj.gate_delta_pct is None:
            return "—"
        return f"{obj.gate_delta_pct:+.1f}%"

    @admin.display(description="payload (whole USD)")
    def payload_pretty(self, obj):
        return format_html("<pre style='margin:0'>{}</pre>", json.dumps(obj.payload, indent=2))

    @admin.action(description="Run reconciliation gate (.NET)")
    def run_gate(self, request, queryset):
        gated = 0
        for proposal in queryset:
            try:
                verdict = reconcile(proposal)
            except GateUnreachable as exc:
                self.message_user(request, str(exc), level=messages.ERROR)
                return
            proposal.gate_status = verdict["status"]
            proposal.gate_detail = verdict["detail"]
            proposal.gate_delta_pct = verdict["delta_pct"]
            proposal.gate_segment_sum_usd = verdict["segment_sum_usd"]
            proposal.gate_checked_at = timezone.now()
            if proposal.status == Proposal.STATUS_PENDING:
                proposal.status = Proposal.STATUS_GATED
            proposal.save()
            gated += 1
        self.message_user(request, f"Gate ran on {gated} proposal(s).", level=messages.SUCCESS)

    @admin.action(description="Approve for publication")
    def approve(self, request, queryset):
        approved = 0
        for proposal in queryset:
            if proposal.status != Proposal.STATUS_GATED or proposal.gate_status != "publishable":
                self.message_user(
                    request,
                    f"{proposal}: refusing to publish — gate verdict is "
                    f"'{proposal.gate_status or 'not yet run'}'. "
                    "Nothing publishes unless it reconciles.",
                    level=messages.ERROR,
                )
                continue
            proposal.status = Proposal.STATUS_APPROVED
            proposal.reviewed_by = request.user.get_username()
            proposal.reviewed_at = timezone.now()
            proposal.save()
            approved += 1
        if approved:
            self.message_user(
                request, f"Approved {approved} proposal(s) for publication.", level=messages.SUCCESS
            )

    @admin.action(description="Reject")
    def reject(self, request, queryset):
        updated = queryset.update(
            status=Proposal.STATUS_REJECTED,
            reviewed_by=request.user.get_username(),
            reviewed_at=timezone.now(),
        )
        self.message_user(request, f"Rejected {updated} proposal(s).", level=messages.WARNING)

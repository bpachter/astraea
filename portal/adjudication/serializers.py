from rest_framework import serializers

from .models import Proposal


class ProposalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proposal
        fields = [
            "id",
            "company",
            "fiscal_year",
            "payload",
            "proposed_by",
            "citation_check",
            "synthetic",
            "source_url",
            "source_note",
            "status",
            "gate_status",
            "gate_detail",
            "gate_delta_pct",
            "gate_segment_sum_usd",
            "gate_checked_at",
            "reviewed_by",
            "reviewed_at",
            "created_at",
        ]
        read_only_fields = fields

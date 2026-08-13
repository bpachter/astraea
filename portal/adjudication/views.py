from django.utils import timezone
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .gate import GateUnreachable, reconcile
from .models import Proposal
from .serializers import ProposalSerializer


class ProposalViewSet(viewsets.ReadOnlyModelViewSet):
    """Read the adjudication queue; gate and adjudicate via explicit actions.

    Mutation happens only through named transitions — there is no PATCH that
    could quietly move a proposal to approved without a gate verdict.
    """

    queryset = Proposal.objects.all()
    serializer_class = ProposalSerializer

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def gate(self, request, pk=None):
        proposal = self.get_object()
        try:
            verdict = reconcile(proposal)
        except GateUnreachable as exc:
            return Response({"error": str(exc)}, status=http_status.HTTP_502_BAD_GATEWAY)
        proposal.gate_status = verdict["status"]
        proposal.gate_detail = verdict["detail"]
        proposal.gate_delta_pct = verdict["delta_pct"]
        proposal.gate_segment_sum_usd = verdict["segment_sum_usd"]
        proposal.gate_checked_at = timezone.now()
        if proposal.status == Proposal.STATUS_PENDING:
            proposal.status = Proposal.STATUS_GATED
        proposal.save()
        return Response(self.get_serializer(proposal).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def adjudicate(self, request, pk=None):
        proposal = self.get_object()
        decision = request.data.get("decision")
        if decision not in ("approve", "reject"):
            return Response(
                {"error": "decision must be 'approve' or 'reject'"},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if decision == "approve" and not (
            proposal.status == Proposal.STATUS_GATED and proposal.gate_status == "publishable"
        ):
            return Response(
                {
                    "error": (
                        f"Refusing to publish — gate verdict is "
                        f"'{proposal.gate_status or 'not yet run'}'. "
                        "Nothing publishes unless it reconciles."
                    )
                },
                status=http_status.HTTP_409_CONFLICT,
            )
        proposal.status = (
            Proposal.STATUS_APPROVED if decision == "approve" else Proposal.STATUS_REJECTED
        )
        proposal.reviewed_by = request.user.get_username()
        proposal.reviewed_at = timezone.now()
        proposal.save()
        return Response(self.get_serializer(proposal).data)

from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase

from .models import EdgeProposal, MergeProposal, Proposal, TypeProposal

PUBLISHABLE_VERDICT = {
    "publishable": True,
    "status": "publishable",
    "segment_sum_usd": 7600000000,
    "consolidated_revenue_usd": 7600000000,
    "delta_pct": 0.0,
    "detail": "ties",
}


def make_proposal(**overrides):
    fields = {
        "company": "Testco",
        "fiscal_year": 2024,
        "payload": {
            "consolidated_revenue_usd": 7600000000,
            "segments": [{"name": "Only", "revenue_usd": 7600000000, "kind": "segment"}],
        },
    }
    fields.update(overrides)
    return Proposal.objects.create(**fields)


class AdjudicationApiTests(TestCase):
    def setUp(self):
        self.reviewer = User.objects.create_user("reviewer", password="x")
        self.client.force_login(self.reviewer)

    def test_approval_is_refused_without_a_gate_verdict(self):
        proposal = make_proposal()
        response = self.client.post(
            f"/api/proposals/{proposal.pk}/adjudicate/",
            {"decision": "approve"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("Nothing publishes unless it reconciles", response.json()["error"])
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, Proposal.STATUS_PENDING)

    def test_approval_is_refused_when_gate_failed(self):
        proposal = make_proposal(status=Proposal.STATUS_GATED, gate_status="unreconciled")
        response = self.client.post(
            f"/api/proposals/{proposal.pk}/adjudicate/",
            {"decision": "approve"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)

    def test_gated_publishable_proposal_can_be_approved(self):
        proposal = make_proposal(status=Proposal.STATUS_GATED, gate_status="publishable")
        response = self.client.post(
            f"/api/proposals/{proposal.pk}/adjudicate/",
            {"decision": "approve"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, Proposal.STATUS_APPROVED)
        self.assertEqual(proposal.reviewed_by, "reviewer")

    @patch("adjudication.views.reconcile", return_value=PUBLISHABLE_VERDICT)
    def test_gate_action_attaches_verdict(self, mock_reconcile):
        proposal = make_proposal()
        response = self.client.post(f"/api/proposals/{proposal.pk}/gate/")
        self.assertEqual(response.status_code, 200)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, Proposal.STATUS_GATED)
        self.assertEqual(proposal.gate_status, "publishable")
        mock_reconcile.assert_called_once()

    def test_gate_unreachable_is_a_named_error_not_a_silent_fallback(self):
        # No gate is running on this port; the client must surface that loudly.
        proposal = make_proposal()
        with self.settings(THEMIS_GATE_URL="http://localhost:59999"):
            response = self.client.post(f"/api/proposals/{proposal.pk}/gate/")
        self.assertEqual(response.status_code, 502)
        self.assertIn("unreachable", response.json()["error"])
        proposal.refresh_from_db()
        self.assertEqual(proposal.gate_status, "")

    def test_anonymous_readers_cannot_adjudicate(self):
        proposal = make_proposal(status=Proposal.STATUS_GATED, gate_status="publishable")
        self.client.logout()
        response = self.client.post(
            f"/api/proposals/{proposal.pk}/adjudicate/",
            {"decision": "approve"},
            content_type="application/json",
        )
        self.assertIn(response.status_code, (401, 403))


class GovernedProposalTests(TestCase):
    """The approval guard and the gate contracts for the KG-backed queues."""

    def test_can_approve_requires_a_passing_gate_verdict(self):
        edge = EdgeProposal.objects.create(
            kg_draft_id=1, supplier_id="a", customer_id="b"
        )
        self.assertFalse(edge.can_approve)  # pending, never gated

        edge.status = EdgeProposal.STATUS_GATED
        edge.gate_status = "self_edge"
        self.assertFalse(edge.can_approve)  # gated but refused

        edge.gate_status = "publishable"
        self.assertTrue(edge.can_approve)

    def test_edge_gate_request_body_matches_the_dto_contract(self):
        edge = EdgeProposal.objects.create(
            kg_draft_id=2,
            supplier_id="a",
            customer_id="b",
            disclosed_value=1_000_000.0,
            disclosed_currency="JPY",
        )
        body = edge.gate_request_body
        self.assertEqual(body["edge_kind"], "supplies")
        self.assertEqual(body["disclosed_currency"], "JPY")
        self.assertIsNone(body["contract_value_usd"])
        self.assertEqual(
            set(body),
            {
                "edge_kind", "supplier_id", "customer_id", "target_id", "target_kind",
                "existing_maker_count", "component_desc", "confidence",
                "disclosed_value", "disclosed_currency", "contract_value_usd",
            },
        )

    def test_retype_and_merge_bodies_carry_substance(self):
        substance = {
            "live_edges": 1, "federal_contracts": 3, "federal_contract_usd": 42_000_000.0,
            "has_ticker": False, "has_intel_id": False, "has_lei": False,
        }
        retype = TypeProposal.objects.create(
            kg_item_id=1, ref_id="n1", name="Patriot Team",
            current_type="organization", proposed_type="generic",
            source="rule", substance=substance,
        )
        self.assertEqual(retype.gate_request_body["substance"], substance)

        merge = MergeProposal.objects.create(
            survivor_name="Pratt & Whitney", loser_name="Pratt",
            survivor_substance=substance, loser_substance={},
        )
        body = merge.gate_request_body
        self.assertFalse(body["shared_identity"])
        self.assertEqual(body["survivor"], substance)

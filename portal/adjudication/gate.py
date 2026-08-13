"""Client for the Themis .NET reconciliation gate.

A catch that returns null must say something: every failure here raises
GateUnreachable with a human-readable reason rather than degrading into a
plausible empty verdict.
"""

import requests
from django.conf import settings


class GateUnreachable(Exception):
    pass


def reconcile(proposal):
    """POST one proposal to the gate; return its verdict dict."""
    url = f"{settings.THEMIS_GATE_URL}/reconcile"
    try:
        response = requests.post(url, json=proposal.gate_request_body, timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise GateUnreachable(
            f"Reconciliation gate unreachable at {url} — is Themis.Gate running? ({exc})"
        ) from exc
    return response.json()

"""Client for the Themis .NET reconciliation gate.

A catch that returns null must say something: every failure here raises
GateUnreachable with a human-readable reason rather than degrading into a
plausible empty verdict.
"""

import requests
from django.conf import settings


class GateUnreachable(Exception):
    pass


def call_gate(path, body):
    """POST a request body to one gate endpoint; return its verdict dict."""
    url = f"{settings.THEMIS_GATE_URL}{path}"
    try:
        response = requests.post(url, json=body, timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise GateUnreachable(
            f"Reconciliation gate unreachable at {url} — is Themis.Gate running? ({exc})"
        ) from exc
    return response.json()


def reconcile(proposal):
    """POST one segment proposal to the gate; return its verdict dict."""
    return call_gate("/reconcile", proposal.gate_request_body)

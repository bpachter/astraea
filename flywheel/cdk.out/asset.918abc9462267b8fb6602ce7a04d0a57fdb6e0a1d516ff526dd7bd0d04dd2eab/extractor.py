"""Extractor: propose facts with Bedrock, then submit them for judgment.

The division of labour this whole system exists to enforce, in one function:

    Bedrock proposes  ->  the gate verifies  ->  DynamoDB records
                                                 (a human publishes, elsewhere)

The model is never asked whether its answer is right. That question is
answered by a deterministic service, and its verdict — named, never "failed" —
is what gets stored beside the proposal.

Failures are named and re-raised so SQS can redeliver and, after three
attempts, park the message in the dead-letter queue. A silent catch here would
be an invisible outage: the queue would drain and nothing would be extracted.
"""

import json
import os
from decimal import Decimal

import boto3
import urllib3

TABLE = os.environ["PROPOSALS_TABLE"]
GATE_URL = os.environ["GATE_URL"].rstrip("/")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-haiku-4-5-20251001-v1:0")
NAMESPACE = "Astraea/Flywheel"

bedrock = boto3.client("bedrock-runtime")
table = boto3.resource("dynamodb").Table(TABLE)
cloudwatch = boto3.client("cloudwatch")
http = urllib3.PoolManager()

PROMPT = """You are extracting reported segment revenue from a US public company's annual filing.

Company: {company} (CIK {cik}), fiscal year {fiscal_year}.

Return ONLY a JSON object, no prose, with this exact shape:
{{"consolidated_revenue_usd": <number>, "segments": [{{"name": "<segment>", "revenue_usd": <number>, "kind": "segment"}}]}}

Rules:
- Whole US dollars, not millions or billions.
- Operating segments only. Use kind "reconciling" for corporate/eliminations rows.
- Do not include a total row: the reconciliation gate treats a smuggled total as
  a defect, and it will refuse the proposal.
- If you do not know the figures, return {{"consolidated_revenue_usd": null, "segments": []}}
  rather than inventing them. Absence is honest; a plausible wrong number is not."""


class ExtractionFailure(Exception):
    """Named, and allowed to propagate: SQS retries, then the DLQ holds it."""


def _metric(name, value=1.0, **dimensions):
    cloudwatch.put_metric_data(
        Namespace=NAMESPACE,
        MetricData=[{
            "MetricName": name,
            "Value": value,
            "Unit": "Count",
            "Dimensions": [{"Name": k, "Value": str(v)} for k, v in dimensions.items()],
        }],
    )


def propose(company, cik, fiscal_year):
    """Ask the model for facts. Its answer is a proposal, not a result."""
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1500,
        "messages": [{
            "role": "user",
            "content": PROMPT.format(company=company, cik=cik, fiscal_year=fiscal_year),
        }],
    }
    try:
        response = bedrock.invoke_model(modelId=MODEL_ID, body=json.dumps(body))
    except Exception as exc:  # model access, throttling, region availability
        raise ExtractionFailure(f"bedrock_invoke_failed: {type(exc).__name__}: {exc}") from exc

    text = json.loads(response["body"].read())["content"][0]["text"].strip()
    if text.startswith("```"):
        text = text.split("```")[1].removeprefix("json").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ExtractionFailure(f"model_returned_non_json: {text[:200]}") from exc


def adjudicate(company, fiscal_year, proposal):
    """Submit the proposal to the gate and return its named verdict."""
    payload = {
        "company": company,
        "fiscal_year": fiscal_year,
        "consolidated_revenue_usd": proposal.get("consolidated_revenue_usd"),
        "segments": proposal.get("segments") or [],
    }
    response = http.request(
        "POST",
        f"{GATE_URL}/reconcile",
        body=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        timeout=urllib3.Timeout(connect=5, read=20),
        retries=False,
    )
    if response.status != 200:
        raise ExtractionFailure(f"gate_returned_{response.status}: {response.data[:200]}")
    return json.loads(response.data)


def handler(event, context):
    results = []
    for record in event["Records"]:
        message = json.loads(record["body"])
        company = message["company"]
        fiscal_year = message["fiscal_year"]
        # Deterministic key: a redelivered message rewrites its item rather
        # than appending a second one. This is what makes at-least-once safe.
        key = f"{company}#{fiscal_year}"

        proposal = propose(company, message["cik"], fiscal_year)
        verdict = adjudicate(company, fiscal_year, proposal)

        table.put_item(Item=json.loads(json.dumps({
            "proposal_id": key,
            "company": company,
            "fiscal_year": fiscal_year,
            "run_id": message.get("run_id"),
            "source_message_id": record["messageId"],
            "attempt": int(record["attributes"]["ApproximateReceiveCount"]),
            "model_id": MODEL_ID,
            "proposal": proposal,
            "verdict": verdict,
            # Never "approved": publication is a human act, elsewhere.
            "status": "awaiting_adjudication",
        }), parse_float=Decimal))

        _metric("ProposalsExtracted")
        _metric("Verdict", 1.0, FailureMode=verdict["status"])
        print(json.dumps({"proposal_id": key, "verdict": verdict["status"],
                          "publishable": verdict["publishable"]}))
        results.append({"proposal_id": key, "verdict": verdict["status"]})

    return {"processed": results}

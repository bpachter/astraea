"""Planner: decide what to extract, and put one message per unit of work.

Deliberately dumb. Enumeration is cheap and must never be the thing that
fails: it reads a static work list, fans it into SQS, and returns counts. All
the expensive, fallible work happens downstream where a failure costs one
message rather than the whole run.
"""

import json
import os
import uuid

import boto3

QUEUE_URL = os.environ["WORK_QUEUE_URL"]
sqs = boto3.client("sqs")

# The cohort to sweep. In the local flywheel this comes from the graph's own
# coverage census; here it is committed so a scheduled run is reproducible and
# a reviewer can see exactly what the pipeline touches.
WORK = [
    {"company": "Apple Inc.", "cik": "0000320193", "fiscal_year": 2023},
    {"company": "Microsoft Corporation", "cik": "0000789019", "fiscal_year": 2023},
    {"company": "NVIDIA Corporation", "cik": "0001045810", "fiscal_year": 2024},
    {"company": "Intel Corporation", "cik": "0000050863", "fiscal_year": 2023},
]


def handler(event, context):
    run_id = str(uuid.uuid4())
    sent = 0
    for item in WORK:
        sqs.send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=json.dumps({**item, "run_id": run_id}),
            # The dedup identity travels with the message so the extractor
            # writes the same item on a redelivery instead of a second one.
            MessageAttributes={
                "idempotency_key": {
                    "DataType": "String",
                    "StringValue": f"{item['company']}#{item['fiscal_year']}",
                }
            },
        )
        sent += 1

    print(json.dumps({"run_id": run_id, "enqueued": sent}))
    return {"run_id": run_id, "enqueued": sent}

"""Split-conformal confidence calibration.

Adapted from powerscope's quantile calibration (calibrate on a held-out split,
correct with empirical quantities, enforce monotonicity with a cumulative max).
Here the outcome is binary — did a human adjudicator uphold the extraction? —
so the calibrated value for a raw confidence is the empirical precision of its
bin on the calibration split, validated against the disjoint split.

The algorithm is deliberately deterministic and dependency-free so the .NET
gate implements it identically (Calibration.cs); a shared fixture pinned in
both test suites proves the two implementations agree.
"""

import json
from pathlib import Path

from django.conf import settings


def calibrate(pairs, bins=10):
    """pairs: iterable of (score, outcome_bool). Returns the calibration table.

    Deterministic split: sort by (score, insertion order); even ranks form the
    calibration set, odd ranks the validation set. The table maps rank-based
    score bins to empirical precision, made monotone by cumulative max —
    powerscope's np.maximum.accumulate, in portable form.
    """
    ordered = sorted(
        ((float(s), bool(o)) for s, o in pairs),
        key=lambda p: p[0],
    )
    if len(ordered) < bins * 2:
        raise ValueError(f"need at least {bins * 2} pairs, got {len(ordered)}")
    cal = ordered[0::2]
    val = ordered[1::2]

    n = len(cal)
    table = []
    running_max = 0.0
    for b in range(bins):
        lo_i, hi_i = b * n // bins, (b + 1) * n // bins
        chunk = cal[lo_i:hi_i]
        precision = sum(1 for _, o in chunk if o) / len(chunk)
        running_max = max(running_max, precision)
        table.append({
            "raw_lo": chunk[0][0],
            "raw_hi": chunk[-1][0],
            "calibrated": round(running_max, 4),
            "n": len(chunk),
        })

    # Assign each validation point to the first bin whose raw_hi covers it
    # (the same rule apply_calibration uses), then compare per-bin precision.
    assigned = [[] for _ in table]
    for s, o in val:
        for i, row in enumerate(table):
            if s <= row["raw_hi"] or i == len(table) - 1:
                assigned[i].append(o)
                break
    per_bin, max_gap = [], 0.0
    for row, hits in zip(table, assigned):
        if hits:
            emp = sum(hits) / len(hits)
            max_gap = max(max_gap, abs(emp - row["calibrated"]))
            per_bin.append({"raw_hi": row["raw_hi"], "empirical": round(emp, 4), "n": len(hits)})

    return {
        "method": "split-conformal binned precision (monotone)",
        "source_n": len(ordered),
        "bins": table,
        "validation": {"n": len(val), "max_abs_gap": round(max_gap, 4), "per_bin": per_bin},
    }


def apply_calibration(raw, table):
    """Map a raw confidence to its calibrated value via the monotone table."""
    for row in table["bins"]:
        if raw <= row["raw_hi"]:
            return row["calibrated"]
    return table["bins"][-1]["calibrated"]


_CACHE = {"path": None, "table": None}


def load_table():
    """The portal's calibration table (data/calibration.json), cached; None if absent."""
    path = Path(settings.BASE_DIR).parent / "data" / "calibration.json"
    if _CACHE["path"] == path and _CACHE["table"] is not None:
        return _CACHE["table"]
    if not path.exists():
        return None
    _CACHE["path"] = path
    _CACHE["table"] = json.loads(path.read_text(encoding="utf-8"))
    return _CACHE["table"]

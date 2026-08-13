namespace Themis.Gate;

/// <summary>
/// One extracted revenue row. Kind is "segment" for operating segments and
/// "reconciling" for corporate/eliminations rows, which count toward the sum
/// but are never candidates for rollup detection.
/// </summary>
public sealed record SegmentFact(string Name, decimal RevenueUsd, string Kind = "segment");

/// <summary>
/// A proposed set of segment facts extracted from one filing. Revenue is whole
/// USD — a scale riding in a column (millions vs thousands) is a unit bug
/// waiting one layer down where nothing can catch it.
/// </summary>
public sealed record ExtractionProposal(
    string Company,
    int FiscalYear,
    decimal? ConsolidatedRevenueUsd,
    IReadOnlyList<SegmentFact>? Segments);

public sealed record ReconciliationVerdict(
    bool Publishable,
    string Status,
    decimal SegmentSumUsd,
    decimal? ConsolidatedRevenueUsd,
    decimal? DeltaPct,
    string Detail);

/// <summary>
/// The deterministic gate: nothing publishes unless it reconciles to the
/// consolidated figure in the same filing. Failures are named, not lumped —
/// an unnamed failure cannot be triaged and a plausible wrong number cannot
/// be detected downstream.
/// </summary>
public static class ReconciliationEngine
{
    /// <summary>Segment sums may differ from consolidated by at most this percentage.</summary>
    public const decimal TolerancePct = 2.0m;

    public static readonly IReadOnlyDictionary<string, string> FailureModes = new Dictionary<string, string>
    {
        ["no_segments"] = "The proposal carries no operating segment rows; there is nothing to reconcile.",
        ["no_consolidated"] = "No consolidated revenue figure from the same filing; a segment sum with no anchor is unverifiable.",
        ["duplicate_facts"] = "The same fact appears more than once — a repeated row, or two reporting dimensions flattened into one list.",
        ["undetected_rollup"] = "A total row is riding in the segment list, doubling the sum while every individual row looks correct.",
        ["unreconciled"] = "The segment sum does not tie to consolidated revenue within tolerance.",
    };

    public static ReconciliationVerdict Evaluate(ExtractionProposal proposal)
    {
        var segments = proposal.Segments ?? [];
        var operating = segments
            .Where(s => !string.Equals(s.Kind, "reconciling", StringComparison.OrdinalIgnoreCase))
            .ToList();
        var sum = segments.Sum(s => s.RevenueUsd);

        if (operating.Count == 0)
            return Fail("no_segments", sum, proposal.ConsolidatedRevenueUsd,
                "Proposal carries no operating segment rows; nothing to reconcile.");

        if (proposal.ConsolidatedRevenueUsd is not > 0m)
            return Fail("no_consolidated", sum, null,
                "No consolidated figure in the same filing to reconcile against; refusing to publish an unanchored sum.");

        var consolidated = proposal.ConsolidatedRevenueUsd.Value;

        var duplicate = operating
            .GroupBy(s => Normalize(s.Name))
            .FirstOrDefault(g => g.Count() > 1);
        if (duplicate is not null)
            return Fail("duplicate_facts", sum, consolidated,
                $"Segment '{duplicate.First().Name}' appears {duplicate.Count()} times; the same fact counted twice inflates the sum undetectably.");

        // A "Total" row smuggled into the segment list equals the sum of its
        // siblings. Requires 3+ rows: with two, each trivially "equals the rest".
        if (operating.Count >= 3)
        {
            foreach (var row in operating)
            {
                var siblings = operating.Where(s => !ReferenceEquals(s, row)).Sum(s => s.RevenueUsd);
                if (siblings > 0m && WithinTolerance(row.RevenueUsd, siblings))
                    return Fail("undetected_rollup", sum, consolidated,
                        $"'{row.Name}' equals the sum of the remaining segments; a total row is riding in the segment list.");
            }
        }

        // Geography and product dimensions flattened into one list each sum to
        // consolidated, so together they land at ~2x.
        if (WithinTolerance(sum, consolidated * 2m))
            return Fail("duplicate_facts", sum, consolidated,
                "Segment sum is ~2x consolidated revenue; two reporting dimensions appear to be flattened into one list.");

        var deltaPct = decimal.Round((sum - consolidated) / consolidated * 100m, 3);
        if (Math.Abs(deltaPct) <= TolerancePct)
            return new(true, "publishable", sum, consolidated, deltaPct,
                $"Segment sum ties to consolidated within {TolerancePct}% (delta {deltaPct}%).");

        return Fail("unreconciled", sum, consolidated,
            $"Segment sum differs from consolidated by {deltaPct}%; outside the {TolerancePct}% gate.");
    }

    private static ReconciliationVerdict Fail(string mode, decimal sum, decimal? consolidated, string detail)
    {
        decimal? deltaPct = consolidated is > 0m
            ? decimal.Round((sum - consolidated.Value) / consolidated.Value * 100m, 3)
            : null;
        return new(false, mode, sum, consolidated, deltaPct, detail);
    }

    private static bool WithinTolerance(decimal actual, decimal expected) =>
        expected != 0m && Math.Abs(actual - expected) / Math.Abs(expected) * 100m <= TolerancePct;

    private static string Normalize(string name) =>
        new([.. name.ToLowerInvariant().Where(char.IsLetterOrDigit)]);
}

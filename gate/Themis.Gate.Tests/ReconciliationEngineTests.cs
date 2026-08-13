using Themis.Gate;

namespace Themis.Gate.Tests;

public class ReconciliationEngineTests
{
    private static ExtractionProposal Proposal(decimal? consolidated, params SegmentFact[] segments) =>
        new("Test Co", 2023, consolidated, segments);

    // Real fixture: Apple FY2023 10-K geographic segments, whole USD.
    // The clean case the gate exists to let through.
    [Fact]
    public void Apple_fy2023_geographic_segments_reconcile()
    {
        var verdict = ReconciliationEngine.Evaluate(Proposal(383_285_000_000m,
            new SegmentFact("Americas", 162_560_000_000m),
            new SegmentFact("Europe", 94_294_000_000m),
            new SegmentFact("Greater China", 72_559_000_000m),
            new SegmentFact("Japan", 24_257_000_000m),
            new SegmentFact("Rest of Asia Pacific", 29_615_000_000m)));

        Assert.True(verdict.Publishable);
        Assert.Equal("publishable", verdict.Status);
        Assert.Equal(0m, verdict.DeltaPct);
    }

    [Fact]
    public void Reconciling_rows_count_toward_the_sum()
    {
        var verdict = ReconciliationEngine.Evaluate(Proposal(7_600m,
            new SegmentFact("Marine Systems", 5_000m),
            new SegmentFact("Port Services", 3_000m),
            new SegmentFact("Corporate & eliminations", -400m, Kind: "reconciling")));

        Assert.True(verdict.Publishable);
    }

    [Fact]
    public void Missing_consolidated_is_named_not_lumped()
    {
        var verdict = ReconciliationEngine.Evaluate(Proposal(null,
            new SegmentFact("Only Segment", 1_000m)));

        Assert.False(verdict.Publishable);
        Assert.Equal("no_consolidated", verdict.Status);
    }

    [Fact]
    public void Empty_segment_list_is_no_segments()
    {
        var verdict = ReconciliationEngine.Evaluate(Proposal(1_000m));

        Assert.False(verdict.Publishable);
        Assert.Equal("no_segments", verdict.Status);
    }

    [Fact]
    public void A_total_row_in_the_list_is_undetected_rollup_not_duplicate()
    {
        // Sum is 2x consolidated too — the more specific diagnosis must win.
        var verdict = ReconciliationEngine.Evaluate(Proposal(8_500m,
            new SegmentFact("Precision Tooling", 4_200m),
            new SegmentFact("Automation", 2_800m),
            new SegmentFact("Aftermarket", 1_500m),
            new SegmentFact("Total Segments", 8_500m)));

        Assert.False(verdict.Publishable);
        Assert.Equal("undetected_rollup", verdict.Status);
    }

    [Fact]
    public void Two_dimensions_flattened_into_one_list_is_duplicate_facts()
    {
        var verdict = ReconciliationEngine.Evaluate(Proposal(1_000m,
            new SegmentFact("Americas", 600m),
            new SegmentFact("International", 400m),
            new SegmentFact("Platform", 700m),
            new SegmentFact("Services", 300m)));

        Assert.False(verdict.Publishable);
        Assert.Equal("duplicate_facts", verdict.Status);
    }

    [Fact]
    public void A_repeated_row_is_duplicate_facts()
    {
        var verdict = ReconciliationEngine.Evaluate(Proposal(3_000m,
            new SegmentFact("Cloud", 1_000m),
            new SegmentFact("cloud ", 1_000m),
            new SegmentFact("Devices", 1_000m)));

        Assert.False(verdict.Publishable);
        Assert.Equal("duplicate_facts", verdict.Status);
    }

    [Fact]
    public void Sum_off_by_more_than_tolerance_is_unreconciled()
    {
        var verdict = ReconciliationEngine.Evaluate(Proposal(9_800m,
            new SegmentFact("Defense", 7_400m),
            new SegmentFact("Commercial", 5_000m)));

        Assert.False(verdict.Publishable);
        Assert.Equal("unreconciled", verdict.Status);
        Assert.NotNull(verdict.DeltaPct);
        Assert.True(verdict.DeltaPct > 20m);
    }

    [Fact]
    public void Tolerance_boundary_is_inclusive_at_exactly_two_percent()
    {
        var pass = ReconciliationEngine.Evaluate(Proposal(10_000m,
            new SegmentFact("A", 6_000m),
            new SegmentFact("B", 4_200m)));
        Assert.True(pass.Publishable);
        Assert.Equal(2.0m, pass.DeltaPct);

        var fail = ReconciliationEngine.Evaluate(Proposal(10_000m,
            new SegmentFact("A", 6_000m),
            new SegmentFact("B", 4_250m)));
        Assert.False(fail.Publishable);
        Assert.Equal("unreconciled", fail.Status);
    }

    [Fact]
    public void Two_segments_where_one_equals_the_other_is_not_rollup()
    {
        // With only two rows each trivially "equals the rest"; the rollup
        // heuristic must not fire below three rows.
        var verdict = ReconciliationEngine.Evaluate(Proposal(2_000m,
            new SegmentFact("North", 1_000m),
            new SegmentFact("South", 1_000m)));

        Assert.True(verdict.Publishable);
    }
}

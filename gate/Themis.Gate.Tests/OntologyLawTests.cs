namespace Themis.Gate.Tests;

public class OntologyLawTests
{
    private static readonly GraphSubstance Nothing = new(0, 0, 0m, false, false, false);

    private static EdgeProposalDto Edge(
        string kind = "supplies", string? supplier = "a", string? customer = "b",
        string? targetId = null, string? targetKind = null, int? makers = null,
        decimal? usd = null, string? currency = null) =>
        new(kind, supplier, customer, targetId, targetKind, makers,
            "part", 0.9m, null, currency, usd);

    [Fact]
    public void A_node_cannot_supply_itself()
    {
        var verdict = OntologyLaw.ValidateEdge(Edge(supplier: "x", customer: "x"));
        Assert.Equal("self_edge", verdict.Status);
    }

    [Fact]
    public void A_yen_disclosure_cannot_ride_in_the_usd_column()
    {
        var verdict = OntologyLaw.ValidateEdge(Edge(usd: 1_000_000m, currency: "JPY"));
        Assert.Equal("usd_column_carries_foreign_currency", verdict.Status);
    }

    [Fact]
    public void A_yen_disclosure_with_no_usd_claim_is_fine()
    {
        var verdict = OntologyLaw.ValidateEdge(Edge(usd: null, currency: "JPY"));
        Assert.True(verdict.Publishable);
    }

    [Fact]
    public void Segment_and_product_ids_must_be_scoped_to_an_owner()
    {
        var bad = OntologyLaw.ValidateEdge(Edge(kind: "makes", targetId: "product:gpus"));
        Assert.Equal("unscoped_id", bad.Status);

        var good = OntologyLaw.ValidateEdge(Edge(kind: "makes", targetId: "product:nvidia:gpus"));
        Assert.True(good.Publishable);
    }

    [Fact]
    public void A_product_has_exactly_one_maker()
    {
        var verdict = OntologyLaw.ValidateEdge(
            Edge(kind: "makes", targetId: "product:intel:data-center", targetKind: "product", makers: 2));
        Assert.Equal("multi_maker_product", verdict.Status);
    }

    [Fact]
    public void Components_and_programs_may_have_many_contributors()
    {
        var component = OntologyLaw.ValidateEdge(
            Edge(kind: "makes", targetId: "c1", targetKind: "component", makers: 34));
        Assert.True(component.Publishable);
    }

    [Fact]
    public void Pratt_must_not_merge_into_Pratt_and_Whitney_on_name_evidence()
    {
        var verdict = OntologyLaw.ValidateMerge(new MergeProposalDto(
            "Pratt & Whitney", "Pratt",
            Survivor: new GraphSubstance(120, 40, 2_000_000_000m, false, true, true),
            Loser: Nothing,
            SharedIdentity: false));
        Assert.Equal("bare_name_merge", verdict.Status);
    }

    [Fact]
    public void A_shared_identity_bridge_carries_what_a_name_cannot()
    {
        var verdict = OntologyLaw.ValidateMerge(new MergeProposalDto(
            "The Boeing Company", "Boeing",
            Survivor: new GraphSubstance(300, 200, 50_000_000_000m, true, true, true),
            Loser: new GraphSubstance(12, 0, 0m, false, true, false),
            SharedIdentity: true));
        Assert.True(verdict.Publishable);
    }

    [Fact]
    public void A_merge_that_retires_the_substance_is_pointing_the_wrong_way()
    {
        // The $134.7B lesson: the "loser" holds the federal contracts.
        var verdict = OntologyLaw.ValidateMerge(new MergeProposalDto(
            "Fluor Marine Propulsion LLC", "FLUOR MARINE PROPULSION, LLC",
            Survivor: new GraphSubstance(2, 0, 0m, false, false, false),
            Loser: new GraphSubstance(9, 88, 13_470_000_000m, false, true, false),
            SharedIdentity: true));
        Assert.Equal("merge_direction_suspect", verdict.Status);
    }

    [Fact]
    public void A_node_with_contracts_cannot_be_demoted_to_generic()
    {
        var verdict = OntologyLaw.ValidateRetype(new RetypeProposalDto(
            "Patriot Team", "organization", "generic", "rule",
            new GraphSubstance(1, 3, 42_000_000m, false, false, false)));
        Assert.Equal("substance_demotion", verdict.Status);
    }

    [Fact]
    public void A_contractless_press_stub_may_be_demoted()
    {
        var verdict = OntologyLaw.ValidateRetype(new RetypeProposalDto(
            "advanced space solutions", "organization", "generic", "rule", Nothing));
        Assert.True(verdict.Publishable);
    }

    [Fact]
    public void Promotions_are_not_demotions()
    {
        var verdict = OntologyLaw.ValidateRetype(new RetypeProposalDto(
            "Rocket Lab USA", "generic", "organization", "rule",
            new GraphSubstance(50, 10, 500_000_000m, true, true, true)));
        Assert.True(verdict.Publishable);
    }
}

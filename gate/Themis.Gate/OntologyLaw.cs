namespace Themis.Gate;

/// <summary>
/// What a node actually holds, counted across every referencing table — never
/// judged from how its name reads. Provenance beats name shape.
/// </summary>
public sealed record GraphSubstance(
    int LiveEdges,
    int FederalContracts,
    decimal FederalContractUsd,
    bool HasTicker,
    bool HasIntelId,
    bool HasLei)
{
    /// <summary>
    /// Substance for choosing merge survivors: live edges + federal contracts +
    /// the identity bridges. Contract dollars enter log-scaled so $134.7B
    /// dominates a press stub without a single mega-award drowning everything.
    /// </summary>
    public decimal Score() =>
        LiveEdges
        + FederalContracts * 3
        + (decimal)Math.Log10((double)Math.Max(FederalContractUsd, 0m) + 1) * 10
        + (HasTicker ? 4 : 0)
        + (HasIntelId ? 3 : 0)
        + (HasLei ? 2 : 0);
}

public sealed record EdgeProposalDto(
    string EdgeKind,               // "supplies" | "makes"
    string? SupplierId,
    string? CustomerId,
    string? TargetId,
    string? TargetKind,            // for makes: "product" | "component"
    int? ExistingMakerCount,       // live edge_makes rows for TargetId, excluding this proposer
    string? ComponentDesc,
    decimal? Confidence,
    decimal? DisclosedValue,
    string? DisclosedCurrency,
    decimal? ContractValueUsd);

public sealed record MergeProposalDto(
    string SurvivorName,
    string LoserName,
    GraphSubstance Survivor,
    GraphSubstance Loser,
    bool SharedIdentity);          // same LEI or intel_id on both nodes

public sealed record RetypeProposalDto(
    string Name,
    string? CurrentType,
    string? ProposedType,
    string Source,                 // "rule" | "llm" | curator
    GraphSubstance Substance);

public sealed record LawVerdict(bool Publishable, string Status, string Detail);

/// <summary>
/// Ontology law: the identity and typing rules of the graph as deterministic,
/// named refusals. A merge is a permanent auto-resolution rule for all future
/// extractions, so the gate is conservative by design — it prefers a confident
/// refusal over a plausible mistake.
/// </summary>
public static class OntologyLaw
{
    public static readonly IReadOnlyDictionary<string, string> FailureModes = new Dictionary<string, string>
    {
        ["self_edge"] = "A node cannot supply itself; the counterparty resolved to the proposer.",
        ["usd_column_carries_foreign_currency"] = "A non-USD disclosure is riding in the USD column; a yen figure there reads as ~150x.",
        ["unscoped_id"] = "Segment and product ids must be scoped to their owner (kind:owner:slug); shared nodes sum unrelated money.",
        ["multi_maker_product"] = "A product has exactly one maker; a second maker means it is a category or a program.",
        ["bare_name_merge"] = "Never merge a bare surname or acronym on name evidence; single tokens collide across unrelated companies.",
        ["merge_direction_suspect"] = "The merge retires the node holding the substance; survivors are chosen on substance, not name shape.",
        ["substance_demotion"] = "Refusing to demote a node that holds real edges, contracts, or identity to 'generic' — provenance beats name shape.",
    };

    public static LawVerdict ValidateEdge(EdgeProposalDto edge)
    {
        if (edge.SupplierId is not null && edge.SupplierId == edge.CustomerId)
            return Fail("self_edge",
                $"supplier and customer are the same node ({edge.SupplierId}).");

        var currency = edge.DisclosedCurrency?.Trim().ToUpperInvariant();
        if (edge.ContractValueUsd is not null && currency is not (null or "" or "USD"))
            return Fail("usd_column_carries_foreign_currency",
                $"contract_value_usd is populated while the disclosed currency is {currency}; " +
                "convert explicitly or publish the currency-tagged value only.");

        if (edge.TargetId is not null &&
            (edge.TargetId.StartsWith("segment:") || edge.TargetId.StartsWith("product:")))
        {
            var parts = edge.TargetId.Split(':');
            if (parts.Length != 3 || parts.Any(string.IsNullOrWhiteSpace))
                return Fail("unscoped_id",
                    $"'{edge.TargetId}' is not scoped as kind:owner:slug; Intel's 'Data Center' " +
                    "and NVIDIA's are different businesses.");
        }

        if (edge.EdgeKind == "makes" &&
            string.Equals(edge.TargetKind, "product", StringComparison.OrdinalIgnoreCase) &&
            edge.ExistingMakerCount is > 0)
            return Fail("multi_maker_product",
                $"'{edge.TargetId}' already has {edge.ExistingMakerCount} live maker(s); " +
                "anything claimed by two is a category or a program.");

        return Pass("edge proposal violates no ontology law; eligible for human adjudication.");
    }

    public static LawVerdict ValidateMerge(MergeProposalDto merge)
    {
        // Hard identity evidence (shared LEI / intel_id) is the only thing that
        // can carry a single-token name; the name itself never suffices.
        if (!merge.SharedIdentity)
        {
            var bare = new[] { merge.LoserName, merge.SurvivorName }
                .FirstOrDefault(n => IsBareToken(n));
            if (bare is not null)
                return Fail("bare_name_merge",
                    $"'{bare}' is a single bare token; PRATT & MILLER ENGINEERING is not " +
                    "Pratt & Whitney. Bring an LEI or intel_id bridge, not a name.");
        }

        var survivorScore = merge.Survivor.Score();
        var loserScore = merge.Loser.Score();
        if (loserScore > survivorScore)
            return Fail("merge_direction_suspect",
                $"loser substance {loserScore:0.#} exceeds survivor substance {survivorScore:0.#} " +
                $"(loser holds {merge.Loser.FederalContracts} federal contract(s), " +
                $"${merge.Loser.FederalContractUsd:N0}); the merge points the wrong way.");

        return Pass("merge violates no identity rule; eligible for human adjudication.");
    }

    public static LawVerdict ValidateRetype(RetypeProposalDto retype)
    {
        var demoting = string.Equals(retype.ProposedType, "generic", StringComparison.OrdinalIgnoreCase);
        var substance = retype.Substance;
        if (demoting &&
            (substance.FederalContracts > 0 || substance.FederalContractUsd > 0m ||
             substance.HasTicker || substance.HasIntelId))
            return Fail("substance_demotion",
                $"'{retype.Name}' holds {substance.FederalContracts} federal contract(s) " +
                $"(${substance.FederalContractUsd:N0})" +
                (substance.HasTicker ? ", a ticker" : "") +
                (substance.HasIntelId ? ", an intel_id bridge" : "") +
                "; 'Patriot Team' was one confidence point from this mistake.");

        return Pass("retype violates no ontology law; eligible for human adjudication.");
    }

    /// <summary>One token, no whitespace — a surname or an acronym, not a company identity.</summary>
    private static bool IsBareToken(string name) =>
        !string.IsNullOrWhiteSpace(name) && !name.Trim().Contains(' ');

    private static LawVerdict Pass(string detail) => new(true, "publishable", detail);
    private static LawVerdict Fail(string mode, string detail) => new(false, mode, detail);
}

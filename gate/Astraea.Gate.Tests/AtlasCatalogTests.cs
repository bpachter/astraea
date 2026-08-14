using System.Text.Json;

namespace Astraea.Gate.Tests;

public class AtlasCatalogTests
{
    private static readonly JsonElement EmptyMeta = JsonDocument.Parse("{}").RootElement;

    private static AtlasCatalog Catalog() => new(new[]
    {
        new AtlasEntity("MAM1c", "metabolite", "glucose", new[] { "Glycolysis" }, EmptyMeta),
        new AtlasEntity("MAR1", "reaction", "hexokinase step", new[] { "Glycolysis" }, EmptyMeta),
        new AtlasEntity("ENSG1", "gene", "GCK", new[] { "Glycolysis" }, EmptyMeta),
        new AtlasEntity("MAM2c", "metabolite", "Glucose-6-phosphate", new[] { "Glycolysis", "PPP" }, EmptyMeta),
        new AtlasEntity("MAM3c", "metabolite", "ATP", new[] { "Glycolysis" }, EmptyMeta),
    });

    [Fact]
    public void Ordering_is_deterministic_label_then_id()
    {
        var page = Catalog().Search(null, null);
        Assert.Equal(new[] { "ATP", "GCK", "glucose", "Glucose-6-phosphate", "hexokinase step" },
            page.Items.Select(e => e.Label).ToArray());
    }

    [Fact]
    public void Query_matches_label_and_id_case_insensitively()
    {
        var byLabel = Catalog().Search("GLUCOSE", null);
        Assert.Equal(2, byLabel.TotalItems);

        var byId = Catalog().Search("ensg", null);
        Assert.Equal(1, byId.TotalItems);
        Assert.Equal("GCK", byId.Items[0].Label);
    }

    [Fact]
    public void Kind_filter_composes_with_query()
    {
        var page = Catalog().Search("glucose", "metabolite");
        Assert.All(page.Items, e => Assert.Equal("metabolite", e.Kind));
        Assert.Equal(2, page.TotalItems);
    }

    [Fact]
    public void Paging_envelope_reports_totals_and_clamps()
    {
        var page = Catalog().Search(null, null, page: 2, pageSize: 2);
        Assert.Equal(2, page.Page);
        Assert.Equal(5, page.TotalItems);
        Assert.Equal(3, page.TotalPages);
        Assert.Equal(new[] { "glucose", "Glucose-6-phosphate" }, page.Items.Select(e => e.Label));

        var overshoot = Catalog().Search(null, null, page: 99, pageSize: 2);
        Assert.Equal(3, overshoot.Page); // clamped to the last page, not empty

        var clampedSize = Catalog().Search(null, null, pageSize: 10_000);
        Assert.Equal(100, clampedSize.PageSize);
    }

    [Fact]
    public void Find_is_exact_id_case_insensitive()
    {
        Assert.Equal("GCK", Catalog().Find("ensg1")!.Label);
        Assert.Null(Catalog().Find("nope"));
    }

    [Fact]
    public void Missing_atlas_directory_loads_null_not_an_empty_catalog()
    {
        Assert.Null(AtlasCatalog.LoadOrNull(Path.Combine(Path.GetTempPath(), "no-such-atlas")));
    }
}

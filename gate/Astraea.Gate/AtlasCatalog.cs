using System.Text.Json;

namespace Astraea.Gate;

public sealed record AtlasEntity(
    string Id,
    string Kind,
    string Label,
    IReadOnlyList<string> Subsystems,
    JsonElement Meta);

public sealed record NodePage(
    IReadOnlyList<AtlasEntity> Items,
    int Page,
    int PageSize,
    int TotalItems,
    int TotalPages,
    string? Query,
    string? Kind);

/// <summary>
/// A traditional lookup surface over the layered-omics atlas: every gene,
/// reaction, and metabolite the pipeline emitted, deduplicated across
/// subsystems, searchable and paged. The classic Web API vocabulary —
/// versioned route, filter parameters, a paging envelope with totals —
/// deliberately spoken fluently.
/// </summary>
public sealed class AtlasCatalog
{
    private readonly List<AtlasEntity> _entities;

    public int Count => _entities.Count;

    public AtlasCatalog(IEnumerable<AtlasEntity> entities)
    {
        // Deterministic catalog order: label, then id — stable paging.
        _entities = entities
            .OrderBy(e => e.Label, StringComparer.OrdinalIgnoreCase)
            .ThenBy(e => e.Id, StringComparer.Ordinal)
            .ToList();
    }

    public NodePage Search(string? query, string? kind, int page = 1, int pageSize = 25)
    {
        pageSize = Math.Clamp(pageSize, 1, 100);
        page = Math.Max(page, 1);
        var q = query?.Trim();

        var filtered = _entities.Where(e =>
            (kind is null || e.Kind.Equals(kind, StringComparison.OrdinalIgnoreCase)) &&
            (string.IsNullOrEmpty(q)
                || e.Label.Contains(q, StringComparison.OrdinalIgnoreCase)
                || e.Id.Contains(q, StringComparison.OrdinalIgnoreCase))).ToList();

        var totalPages = Math.Max(1, (int)Math.Ceiling(filtered.Count / (double)pageSize));
        page = Math.Min(page, totalPages);
        var items = filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return new(items, page, pageSize, filtered.Count, totalPages, q, kind);
    }

    public AtlasEntity? Find(string id) =>
        _entities.FirstOrDefault(e => e.Id.Equals(id, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Loads every subsystem file the atlas pipeline emitted, deduplicating
    /// entities that appear in many subsystems and recording the membership.
    /// Returns null when no atlas is present; the endpoint then says exactly
    /// where it looked instead of serving an empty catalog as if it were real.
    /// </summary>
    public static AtlasCatalog? LoadOrNull(string atlasDir)
    {
        var subsystemsDir = Path.Combine(atlasDir, "subsystems");
        if (!Directory.Exists(subsystemsDir)) return null;

        var byId = new Dictionary<string, (string Kind, string Label, JsonElement Meta, List<string> Subs)>(
            StringComparer.OrdinalIgnoreCase);

        foreach (var file in Directory.EnumerateFiles(subsystemsDir, "*.json"))
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(file));
            var name = doc.RootElement.GetProperty("name").GetString() ?? Path.GetFileName(file);
            foreach (var node in doc.RootElement.GetProperty("nodes").EnumerateArray())
            {
                var id = node.GetProperty("id").GetString()!;
                if (byId.TryGetValue(id, out var existing))
                {
                    existing.Subs.Add(name);
                }
                else
                {
                    byId[id] = (
                        node.GetProperty("kind").GetString()!,
                        node.GetProperty("label").GetString()!,
                        node.GetProperty("meta").Clone(),
                        new List<string> { name });
                }
            }
        }
        if (byId.Count == 0) return null;

        return new AtlasCatalog(byId.Select(kv =>
            new AtlasEntity(kv.Key, kv.Value.Kind, kv.Value.Label,
                kv.Value.Subs.Distinct().OrderBy(s => s).ToList(), kv.Value.Meta)));
    }

    /// <summary>Dev checkout first, then the container mount point.</summary>
    public static string[] DefaultProbePaths(string contentRoot) =>
    [
        Path.Combine(contentRoot, "..", "..", "recon", "public", "atlas"),
        "/app/atlas",
    ];
}

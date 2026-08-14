using System.Text.Json;

namespace Astraea.Gate;

public sealed record CalibrationBin(double RawLo, double RawHi, double Calibrated, int N);

/// <summary>
/// Split-conformal confidence calibration — the same algorithm, bit for bit,
/// as the portal's adjudication/calibration.py (adapted from powerscope's
/// quantile calibration). A raw extraction confidence maps to the empirical
/// precision human adjudicators actually delivered at that confidence level,
/// monotone by cumulative max. A shared fixture pinned in both test suites
/// keeps the two implementations honest against each other.
/// </summary>
public sealed record CalibrationTable(string Method, int SourceN, IReadOnlyList<CalibrationBin> Bins)
{
    public double Apply(double raw)
    {
        foreach (var bin in Bins)
            if (raw <= bin.RawHi)
                return bin.Calibrated;
        return Bins[^1].Calibrated;
    }

    public static CalibrationTable Calibrate(IReadOnlyList<(double Score, bool Outcome)> pairs, int bins = 10)
    {
        var ordered = pairs.OrderBy(p => p.Score).ToList(); // stable, like Python's sort
        if (ordered.Count < bins * 2)
            throw new ArgumentException($"need at least {bins * 2} pairs, got {ordered.Count}");
        var cal = ordered.Where((_, i) => i % 2 == 0).ToList();

        var n = cal.Count;
        var table = new List<CalibrationBin>();
        var runningMax = 0.0;
        for (var b = 0; b < bins; b++)
        {
            int lo = b * n / bins, hi = (b + 1) * n / bins;
            var chunk = cal.GetRange(lo, hi - lo);
            var precision = chunk.Count(p => p.Outcome) / (double)chunk.Count;
            runningMax = Math.Max(runningMax, precision);
            table.Add(new(chunk[0].Score, chunk[^1].Score, Math.Round(runningMax, 4), chunk.Count));
        }
        return new("split-conformal binned precision (monotone)", ordered.Count, table);
    }

    /// <summary>Loads the table the portal's calibrate_confidence command emitted; null if absent.</summary>
    public static CalibrationTable? LoadOrNull(string path)
    {
        if (!File.Exists(path)) return null;
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var root = doc.RootElement;
        var bins = root.GetProperty("bins").EnumerateArray()
            .Select(e => new CalibrationBin(
                e.GetProperty("raw_lo").GetDouble(),
                e.GetProperty("raw_hi").GetDouble(),
                e.GetProperty("calibrated").GetDouble(),
                e.GetProperty("n").GetInt32()))
            .ToList();
        return new(
            root.GetProperty("method").GetString() ?? "",
            root.GetProperty("source_n").GetInt32(),
            bins);
    }
}

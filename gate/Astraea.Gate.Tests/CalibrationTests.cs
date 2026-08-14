namespace Astraea.Gate.Tests;

/// <summary>
/// The shared calibration fixture. The portal's Python implementation
/// (adjudication/calibration.py) pins these exact values in its own test
/// suite; two independent implementations of the same algorithm agreeing on
/// the same fixture is the cross-stack contract.
/// </summary>
public class CalibrationTests
{
    private static readonly (double, bool)[] FIXTURE =
    {
        (0.30, false), (0.35, false), (0.40, false), (0.45, true), (0.50, false),
        (0.55, true), (0.60, false), (0.65, true), (0.70, true), (0.75, false),
        (0.80, true), (0.82, true), (0.85, true), (0.88, false), (0.90, true),
        (0.92, true), (0.94, true), (0.96, true), (0.98, true), (0.99, true),
    };

    [Fact]
    public void Fixture_produces_the_cross_stack_pinned_table()
    {
        var table = CalibrationTable.Calibrate(FIXTURE, bins: 5);

        Assert.Equal(20, table.SourceN);
        Assert.Equal(5, table.Bins.Count);
        Assert.Equal(new CalibrationBin(0.30, 0.40, 0.0, 2), table.Bins[0]);
        Assert.Equal(new CalibrationBin(0.50, 0.60, 0.0, 2), table.Bins[1]);
        Assert.Equal(new CalibrationBin(0.70, 0.80, 1.0, 2), table.Bins[2]);
        Assert.Equal(new CalibrationBin(0.85, 0.90, 1.0, 2), table.Bins[3]);
        Assert.Equal(new CalibrationBin(0.94, 0.98, 1.0, 2), table.Bins[4]);
    }

    [Fact]
    public void Apply_matches_the_python_implementation()
    {
        var table = CalibrationTable.Calibrate(FIXTURE, bins: 5);
        Assert.Equal(0.0, table.Apply(0.55));
        Assert.Equal(1.0, table.Apply(0.97));
        Assert.Equal(1.0, table.Apply(1.00)); // beyond the last bin: clamp
        Assert.Equal(0.0, table.Apply(0.05)); // below the first: first bin
    }

    [Fact]
    public void Calibrated_values_are_monotone_in_raw_confidence()
    {
        var table = CalibrationTable.Calibrate(FIXTURE, bins: 5);
        for (var i = 1; i < table.Bins.Count; i++)
            Assert.True(table.Bins[i].Calibrated >= table.Bins[i - 1].Calibrated);
    }

    [Fact]
    public void Too_few_pairs_is_a_refusal_not_a_noisy_table()
    {
        Assert.Throws<ArgumentException>(() =>
            CalibrationTable.Calibrate(FIXTURE.Take(8).ToArray(), bins: 5));
    }
}

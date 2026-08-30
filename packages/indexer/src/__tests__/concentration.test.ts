import {
  giniCoefficientBps,
  nakamotoCoefficient,
  topNShareBps,
  computeConcentrationMetrics,
} from "../concentration";

describe("giniCoefficientBps", () => {
  it("is 0 for a perfectly equal distribution", () => {
    expect(giniCoefficientBps([10n, 10n, 10n, 10n])).toBe(0);
    expect(giniCoefficientBps([1n, 1n, 1n, 1n, 1n, 1n])).toBe(0);
  });

  it("approaches the theoretical max (n-1)/n when one address holds everything", () => {
    // n = 4  ->  (4-1)/4 = 0.75  ->  7500 bps
    expect(giniCoefficientBps([100n, 0n, 0n, 0n])).toBe(7500);
    // n = 5  ->  (5-1)/5 = 0.80  ->  8000 bps
    expect(giniCoefficientBps([0n, 0n, 1_000_000n, 0n, 0n])).toBe(8000);
  });

  it("sits between the extremes for a skewed distribution", () => {
    const g = giniCoefficientBps([70n, 10n, 10n, 10n]);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(7500);
  });

  it("returns 0 for empty, single-holder, or all-zero inputs", () => {
    expect(giniCoefficientBps([])).toBe(0);
    expect(giniCoefficientBps([42n])).toBe(0);
    expect(giniCoefficientBps([0n, 0n, 0n])).toBe(0);
  });
});

describe("nakamotoCoefficient", () => {
  it("is 1 when a single address holds > 50%", () => {
    expect(nakamotoCoefficient([100n, 10n, 10n, 10n])).toBe(1);
  });

  it("counts the minimum colluding set when several are needed to cross 50%", () => {
    // 30+30 = 60 > 50 of 100, but 30 alone is not
    expect(nakamotoCoefficient([30n, 30n, 30n, 10n])).toBe(2);
    // evenly split four ways: need 3 to exceed 50%
    expect(nakamotoCoefficient([25n, 25n, 25n, 25n])).toBe(3);
  });

  it("requires strictly more than 50% (an exact half is not enough)", () => {
    expect(nakamotoCoefficient([50n, 50n])).toBe(2);
  });

  it("returns 0 for an empty or all-zero distribution", () => {
    expect(nakamotoCoefficient([])).toBe(0);
    expect(nakamotoCoefficient([0n, 0n])).toBe(0);
  });
});

describe("topNShareBps", () => {
  it("computes the top-N share in basis points", () => {
    expect(topNShareBps([50n, 30n, 15n, 5n], 1)).toBe(5000);
    expect(topNShareBps([50n, 30n, 15n, 5n], 2)).toBe(8000);
  });

  it("does not crash or over-count when fewer than N addresses hold power", () => {
    expect(topNShareBps([60n, 40n], 5)).toBe(10_000);
    expect(topNShareBps([1n], 20)).toBe(10_000);
  });

  it("returns 0 for an empty or all-zero distribution rather than dividing by zero", () => {
    expect(topNShareBps([], 5)).toBe(0);
    expect(topNShareBps([0n, 0n, 0n], 1)).toBe(0);
    expect(topNShareBps([10n], 0)).toBe(0);
  });

  it("handles voting power larger than Number.MAX_SAFE_INTEGER", () => {
    const big = 10n ** 30n;
    expect(topNShareBps([big * 3n, big, big * 6n], 1)).toBe(6000);
  });
});

describe("computeConcentrationMetrics", () => {
  it("aggregates holder and delegate distributions into one snapshot shape", () => {
    const holders = [40n, 30n, 20n, 10n];
    const delegates = [60n, 40n];
    const m = computeConcentrationMetrics(holders, delegates);

    expect(m.total_voting_power).toBe(100n);
    expect(m.top1_share_bps).toBe(4000);
    expect(m.top5_share_bps).toBe(10_000);
    expect(m.nakamoto_coefficient).toBe(2);
    expect(m.delegate_top5_share_bps).toBe(10_000);
    expect(m.delegate_gini_coefficient_bps).toBeGreaterThan(0);
  });

  it("survives a near-empty distribution", () => {
    const m = computeConcentrationMetrics([], []);
    expect(m.total_voting_power).toBe(0n);
    expect(m.top1_share_bps).toBe(0);
    expect(m.gini_coefficient_bps).toBe(0);
    expect(m.nakamoto_coefficient).toBe(0);
  });
});

import { computeQuadraticWeight, withRetry } from "../utils";

describe("computeQuadraticWeight", () => {
  it("returns 0 for balance of 0", () => {
    expect(computeQuadraticWeight(0n)).toBe(0n);
  });

  it("returns 1 for balance of 1", () => {
    expect(computeQuadraticWeight(1n)).toBe(1n);
  });

  it("handles perfect squares", () => {
    expect(computeQuadraticWeight(4n)).toBe(2n);
    expect(computeQuadraticWeight(9n)).toBe(3n);
    expect(computeQuadraticWeight(100n)).toBe(10n);
    expect(computeQuadraticWeight(10000n)).toBe(100n);
    expect(computeQuadraticWeight(1_000_000n)).toBe(1000n);
  });

  it("floors non-perfect squares", () => {
    expect(computeQuadraticWeight(2n)).toBe(1n);
    expect(computeQuadraticWeight(3n)).toBe(1n);
    expect(computeQuadraticWeight(8n)).toBe(2n);
    expect(computeQuadraticWeight(99n)).toBe(9n);
    expect(computeQuadraticWeight(101n)).toBe(10n);
    expect(computeQuadraticWeight(9999n)).toBe(99n);
  });

  it("handles typical token balances with 7 decimal places", () => {
    // 10,000 tokens at 10^7 scale = 100_000_000_000
    const balance = 100_000_000_000n;
    const weight = computeQuadraticWeight(balance);
    expect(weight).toBe(316227n); // floor(sqrt(100_000_000_000))
  });

  it("throws for negative balance", () => {
    expect(() => computeQuadraticWeight(-1n)).toThrow();
  });
});

describe("withRetry — jitter and backoff", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, "setTimeout");
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("succeeds on first attempt without sleeping", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { baseDelayMs: 100 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(setTimeout).not.toHaveBeenCalled();
  });

  it("retries and eventually succeeds", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { baseDelayMs: 10, maxAttempts: 3 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("applies delay between retries that is at least the exponential base", async () => {
    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;
    jest.spyOn(global, "setTimeout").mockImplementation((cb: any, ms?: number) => {
      delays.push(ms ?? 0);
      return originalSetTimeout(cb, 0);
    });

    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { baseDelayMs: 100, maxDelayMs: 30000, maxAttempts: 3 });
    await jest.runAllTimersAsync();
    await promise;

    // Two retries means two delays recorded
    expect(delays.length).toBe(2);
    // Each delay must be at least the exponential base (jitter only adds, never subtracts)
    expect(delays[0]).toBeGreaterThanOrEqual(100); // base * 2^0 = 100
    expect(delays[1]).toBeGreaterThanOrEqual(200); // base * 2^1 = 200
  });

  it("caps delay at maxDelayMs before jitter is applied", async () => {
    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;
    jest.spyOn(global, "setTimeout").mockImplementation((cb: any, ms?: number) => {
      delays.push(ms ?? 0);
      return originalSetTimeout(cb, 0);
    });

    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { baseDelayMs: 10000, maxDelayMs: 100, maxAttempts: 2 });
    await jest.runAllTimersAsync();
    await promise;

    // maxDelayMs=100, jitter adds up to 30% → max possible delay is 130
    expect(delays[0]).toBeLessThanOrEqual(130);
  });

  it("throws after exhausting all attempts", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("always fails"));
    const promise = withRetry(fn, { baseDelayMs: 1, maxAttempts: 3 });
    await jest.runAllTimersAsync();
    await expect(promise).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

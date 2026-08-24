import request from "supertest";
import { createApp } from "../api";
import { pool } from "../db";

jest.mock("../db", () => ({
  pool: { query: jest.fn() },
}));

jest.mock("../cache", () => ({
  cached: jest.fn((_key, _ttl, fn) => fn()),
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
  getMetrics: jest.fn(() => ({ hits: 0, misses: 0, size: 0 })),
}));

jest.mock("../events", () => ({
  getLastIndexedLedger: jest.fn().mockResolvedValue(100),
}));

jest.mock("../index", () => ({
  startTime: Date.now(),
}));

const app = createApp({
  getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
} as any);
const query = pool.query as jest.Mock;

const sampleSnapshot = {
  id: 1,
  ledger: 1010,
  computed_at: "2026-08-23T00:00:00.000Z",
  total_voting_power: "5000000",
  top1_share_bps: 4000,
  top5_share_bps: 7000,
  top10_share_bps: 8500,
  top20_share_bps: 9500,
  gini_coefficient_bps: 6200,
  nakamoto_coefficient: 4,
  delegate_top5_share_bps: 7200,
  delegate_gini_coefficient_bps: 6800,
};

describe("concentration monitor REST API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET /analytics/concentration/latest returns the most recent snapshot", async () => {
    query.mockResolvedValueOnce({ rows: [sampleSnapshot] });

    const response = await request(app).get("/analytics/concentration/latest");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(sampleSnapshot);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("concentration_snapshots ORDER BY ledger DESC LIMIT 1"),
    );
  });

  it("GET /analytics/concentration/latest returns null when no snapshot exists", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app).get("/analytics/concentration/latest");

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it("GET /analytics/concentration/history returns snapshot list with default limit", async () => {
    query.mockResolvedValueOnce({ rows: [sampleSnapshot, { ...sampleSnapshot, ledger: 900 }] });

    const response = await request(app).get("/analytics/concentration/history");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [sampleSnapshot, { ...sampleSnapshot, ledger: 900 }] });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY ledger DESC LIMIT $1"),
      [90],
    );
  });

  it("GET /analytics/concentration/history respects a custom limit", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app).get("/analytics/concentration/history?limit=5");

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY ledger DESC LIMIT $1"),
      [5],
    );
  });

  it("GET /analytics/concentration/top-holders returns holders with share bps", async () => {
    query.mockResolvedValueOnce({ rows: [{ total: "5000000" }] });
    query.mockResolvedValueOnce({
      rows: [
        { address: "GABC", power: "2000000" },
        { address: "GDEF", power: "1000000" },
      ],
    });

    const response = await request(app).get("/analytics/concentration/top-holders?limit=2");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { address: "GABC", votingPower: "2000000", shareBps: 4000 },
      { address: "GDEF", votingPower: "1000000", shareBps: 2000 },
    ]);
  });

  it("GET /analytics/concentration/top-delegates returns delegates with share bps", async () => {
    query.mockResolvedValueOnce({ rows: [{ total: "1000000" }] });
    query.mockResolvedValueOnce({
      rows: [{ address: "GDELEG", power: "600000" }],
    });

    const response = await request(app).get("/analytics/concentration/top-delegates?limit=5");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { address: "GDELEG", votingPower: "600000", shareBps: 6000 },
    ]);
  });

  it("returns 0 share bps when total voting power is zero", async () => {
    query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
    query.mockResolvedValueOnce({
      rows: [{ address: "GABC", power: "1000000" }],
    });

    const response = await request(app).get("/analytics/concentration/top-holders?limit=1");

    expect(response.status).toBe(200);
    expect(response.body.data[0].shareBps).toBe(0);
  });

  it("returns 500 when the database query fails", async () => {
    query.mockRejectedValueOnce(new Error("db down"));

    const response = await request(app).get("/analytics/concentration/latest");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Internal server error" });
  });
});
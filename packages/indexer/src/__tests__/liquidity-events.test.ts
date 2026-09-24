import { nativeToScVal, SorobanRpc, xdr } from "@stellar/stellar-sdk";
import { processEvents } from "../events";
import { pool } from "../db";
import { broadcast } from "../ws";

jest.mock("../db", () => ({
  pool: { query: jest.fn() },
}));

jest.mock("../cache", () => ({
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
}));

jest.mock("../ws", () => ({
  broadcast: jest.fn(),
}));

const GOVERNOR = "CGOVERNOR";
const LIQUIDITY = "CLIQUIDITY";

function toScVal(value: unknown): any {
  if (Array.isArray(value)) return xdr.ScVal.scvVec(value.map(toScVal));
  if (value !== null && typeof value === "object" && !(value instanceof xdr.ScVal)) {
    const mapEntries = Object.entries(value).map(([k, v]) =>
      new xdr.ScMapEntry({
        key: nativeToScVal(k, { type: "symbol" }),
        val: toScVal(v),
      }),
    );
    return xdr.ScVal.scvMap(mapEntries);
  }
  return nativeToScVal(value);
}

function makeLiquidityEvent(
  id: string,
  ledger: number,
  eventType: string,
  value: unknown,
  actorAddress?: string,
  contractId = LIQUIDITY,
): SorobanRpc.Api.EventResponse {
  const topics: any[] = [nativeToScVal(eventType, { type: "symbol" })];
  if (actorAddress) {
    topics.push(nativeToScVal(actorAddress));
  }
  return {
    id,
    type: "contract",
    ledger,
    contractId,
    txHash: `tx-${ledger}`,
    topic: topics,
    value: toScVal(value),
  } as unknown as SorobanRpc.Api.EventResponse;
}

describe("liquidity event indexing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
  });

  function run(events: SorobanRpc.Api.EventResponse[]) {
    const server = {
      getEvents: jest.fn().mockResolvedValue({ events }),
    } as unknown as SorobanRpc.Server;
    return processEvents(
      server,
      {
        rpcUrl: "http://fake",
        governorAddress: GOVERNOR,
        liquidityAddress: LIQUIDITY,
        pollIntervalMs: 1,
      },
      100,
    );
  }

  it("handles LiquidityAdded event", async () => {
    await run([
      makeLiquidityEvent(
        "e1",
        100,
        "LiquidityAdded",
        {
          outcome_a: 0,
          outcome_b: 1,
          amount_a: 1000000n,
          amount_b: 2000000n,
          lp_tokens_minted: 1414213n,
        },
        "GPROVIDER1",
      ),
    ]);

    const insertQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO liquidity_events"),
    );
    expect(insertQuery).toBeDefined();
    expect(insertQuery![1]).toEqual([
      "GPROVIDER1",
      0,
      1,
      "1000000",
      "2000000",
      "1414213",
      100,
    ]);
    expect(broadcast).toHaveBeenCalledWith({
      type: "liquidity_added",
      data: {
        provider: "GPROVIDER1",
        outcome_a: 0,
        outcome_b: 1,
        amount_a: "1000000",
        amount_b: "2000000",
        lp_tokens: "1414213",
        ledger: 100,
      },
    });
  });

  it("handles LiquidityRemoved event", async () => {
    await run([
      makeLiquidityEvent(
        "e2",
        105,
        "LiquidityRemoved",
        {
          outcome_a: 0,
          outcome_b: 1,
          amount_a: 500000n,
          amount_b: 1000000n,
          lp_tokens_burned: 707106n,
        },
        "GPROVIDER1",
      ),
    ]);

    const insertQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO liquidity_events"),
    );
    expect(insertQuery).toBeDefined();
    expect(insertQuery![1]).toEqual([
      "GPROVIDER1",
      0,
      1,
      "500000",
      "1000000",
      "707106",
      105,
    ]);
    expect(broadcast).toHaveBeenCalledWith({
      type: "liquidity_removed",
      data: {
        provider: "GPROVIDER1",
        outcome_a: 0,
        outcome_b: 1,
        amount_a: "500000",
        amount_b: "1000000",
        lp_tokens: "707106",
        ledger: 105,
      },
    });
  });

  it("handles Swap event (checking reserve accounting across a swap)", async () => {
    await run([
      makeLiquidityEvent(
        "e3",
        110,
        "Swap",
        {
          outcome_in: 0,
          outcome_out: 1,
          amount_in: 100000n,
          amount_out: 180000n,
          fee: 300n,
        },
        "GTRADER1",
      ),
    ]);

    const insertQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO swap_events"),
    );
    expect(insertQuery).toBeDefined();
    expect(insertQuery![1]).toEqual([
      "GTRADER1",
      0,
      1,
      "100000",
      "180000",
      "300",
      110,
    ]);
    expect(broadcast).toHaveBeenCalledWith({
      type: "swap",
      data: {
        trader: "GTRADER1",
        outcome_in: 0,
        outcome_out: 1,
        amount_in: "100000",
        amount_out: "180000",
        fee: "300",
        ledger: 110,
      },
    });
  });

  it("handles PoolFeeUpdated event", async () => {
    await run([
      makeLiquidityEvent(
        "e4",
        115,
        "PoolFeeUpdated",
        {
          outcome_a: 0,
          outcome_b: 1,
          old_fee_bps: 30,
          new_fee_bps: 25,
        },
      ),
    ]);

    const insertQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO pool_fee_updates"),
    );
    expect(insertQuery).toBeDefined();
    expect(insertQuery![1]).toEqual([0, 1, 30, 25, 115]);
    expect(broadcast).toHaveBeenCalledWith({
      type: "pool_fee_updated",
      data: {
        outcome_a: 0,
        outcome_b: 1,
        old_fee_bps: 30,
        new_fee_bps: 25,
        ledger: 115,
      },
    });
  });

  it("does not handle liquidity events from a non-liquidity contract", async () => {
    await run([
      makeLiquidityEvent(
        "e5",
        120,
        "Swap",
        {
          outcome_in: 0,
          outcome_out: 1,
          amount_in: 100000n,
          amount_out: 180000n,
          fee: 300n,
        },
        "GTRADER1",
        GOVERNOR,
      ),
    ]);

    const insertQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO swap_events"),
    );
    expect(insertQuery).toBeUndefined();
  });
});

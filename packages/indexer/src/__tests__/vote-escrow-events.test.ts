import { nativeToScVal, SorobanRpc, xdr } from "@stellar/stellar-sdk";
import { processEvents } from "../events";
import { pool } from "../db";
import { broadcast } from "../ws";
import { invalidatePattern } from "../cache";

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
const VOTE_ESCROW = "CVOTEESCROW";

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

function makeEvent(
  id: string,
  ledger: number,
  eventType: string,
  value: unknown,
  owner: string,
  contractId = VOTE_ESCROW,
): SorobanRpc.Api.EventResponse {
  return {
    id,
    type: "contract",
    ledger,
    contractId,
    txHash: `tx-${ledger}`,
    topic: [
      nativeToScVal(eventType, { type: "symbol" }),
      nativeToScVal(owner),
    ],
    value: toScVal(value),
  } as unknown as SorobanRpc.Api.EventResponse;
}

describe("vote escrow event indexing", () => {
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
        voteEscrowAddress: VOTE_ESCROW,
        pollIntervalMs: 1,
      },
      100,
    );
  }

  it("inserts a vote_escrow_locks row on LockCreated", async () => {
    await run([
      makeEvent(
        "e1",
        100,
        "LockCreated",
        {
          owner: "GOWNER1",
          amount: 1000n,
          end_ledger: 500,
          initial_voting_power: 2500n,
        },
        "GOWNER1",
      ),
    ]);

    const selectQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("SELECT id FROM vote_escrow_locks"),
    );
    expect(selectQuery).toBeDefined();

    const insertQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO vote_escrow_locks"),
    );
    expect(insertQuery).toBeDefined();
    expect(insertQuery![1]).toEqual(["GOWNER1", "1000", 100, 500, "2500"]);
    expect(invalidatePattern).toHaveBeenCalledWith("vote_escrow:");
    expect(broadcast).toHaveBeenCalledWith({
      type: "vote_escrow_lock_created",
      data: {
        owner: "GOWNER1",
        amount: "1000",
        start_ledger: 100,
        end_ledger: 500,
        initial_voting_power: "2500",
        ledger: 100,
      },
    });
  });

  it("handles idempotent replay for LockCreated when lock already exists", async () => {
    (pool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes("SELECT id FROM vote_escrow_locks")) {
        return Promise.resolve({ rows: [{ id: 1 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await run([
      makeEvent(
        "e1",
        100,
        "LockCreated",
        {
          owner: "GOWNER1",
          amount: 1000n,
          end_ledger: 500,
          initial_voting_power: 2500n,
        },
        "GOWNER1",
      ),
    ]);

    const insertQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO vote_escrow_locks"),
    );
    expect(insertQuery).toBeUndefined();
  });

  it("updates lock amount and voting power on LockIncreased", async () => {
    await run([
      makeEvent(
        "e2",
        105,
        "LockIncreased",
        {
          owner: "GOWNER1",
          added_amount: 500n,
          new_voting_power: 3750n,
        },
        "GOWNER1",
      ),
    ]);

    const updateQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE vote_escrow_locks") && String(sql).includes("amount = amount + $2"),
    );
    expect(updateQuery).toBeDefined();
    expect(updateQuery![1]).toEqual(["GOWNER1", "500", "3750"]);
    expect(invalidatePattern).toHaveBeenCalledWith("vote_escrow:");
    expect(broadcast).toHaveBeenCalledWith({
      type: "vote_escrow_lock_increased",
      data: {
        owner: "GOWNER1",
        added_amount: "500",
        new_voting_power: "3750",
        ledger: 105,
      },
    });
  });

  it("updates end_ledger on LockExtended", async () => {
    await run([
      makeEvent(
        "e3",
        110,
        "LockExtended",
        {
          owner: "GOWNER1",
          old_end_ledger: 500,
          new_end_ledger: 1000,
        },
        "GOWNER1",
      ),
    ]);

    const updateQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE vote_escrow_locks") && String(sql).includes("end_ledger = $2"),
    );
    expect(updateQuery).toBeDefined();
    expect(updateQuery![1]).toEqual(["GOWNER1", 1000]);
    expect(invalidatePattern).toHaveBeenCalledWith("vote_escrow:");
    expect(broadcast).toHaveBeenCalledWith({
      type: "vote_escrow_lock_extended",
      data: {
        owner: "GOWNER1",
        old_end_ledger: 500,
        new_end_ledger: 1000,
        ledger: 110,
      },
    });
  });

  it("updates withdrawn flag transition on LockWithdrawn", async () => {
    await run([
      makeEvent(
        "e4",
        501,
        "LockWithdrawn",
        {
          owner: "GOWNER1",
          amount: 1500n,
        },
        "GOWNER1",
      ),
    ]);

    const updateQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE vote_escrow_locks") && String(sql).includes("withdrawn = TRUE"),
    );
    expect(updateQuery).toBeDefined();
    expect(updateQuery![1]).toEqual(["GOWNER1"]);
    expect(invalidatePattern).toHaveBeenCalledWith("vote_escrow:");
    expect(broadcast).toHaveBeenCalledWith({
      type: "vote_escrow_lock_withdrawn",
      data: {
        owner: "GOWNER1",
        amount: "1500",
        ledger: 501,
      },
    });
  });

  it("does not process vote-escrow events emitted from another contract", async () => {
    await run([
      makeEvent(
        "e5",
        100,
        "LockCreated",
        {
          owner: "GOWNER1",
          amount: 1000n,
          end_ledger: 500,
          initial_voting_power: 2500n,
        },
        "GOWNER1",
        GOVERNOR,
      ),
    ]);

    const insertQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO vote_escrow_locks"),
    );
    expect(insertQuery).toBeUndefined();
    expect(invalidatePattern).not.toHaveBeenCalledWith("vote_escrow:");
  });
});

import {
  parseEpochRootPublishedEvent,
  parseEpochStartedEvent,
  parseLockCreatedEvent,
  parseLockExtendedEvent,
  parseLockIncreasedEvent,
  parseLockWithdrawnEvent,
  parsePoolFundedEvent,
  parseRewardClaimedEvent,
  SorobanEvent,
} from "../events";

const event = (topic: string[], value: unknown): SorobanEvent => ({
  ledger: 42,
  contractId: "CTEST",
  topic,
  value,
});

describe("vote escrow event parsers", () => {
  it("parses LockCreated", () => {
    expect(parseLockCreatedEvent(event(["LockCreated", "GOWNER"], {
      owner: "GOWNER", amount: "1000", end_ledger: 500, initial_voting_power: "800",
    }))).toEqual({ owner: "GOWNER", amount: 1000n, endLedger: 500, initialVotingPower: 800n });
  });
  it("parses LockIncreased", () => {
    expect(parseLockIncreasedEvent(event(["LockIncreased", "GOWNER"], {
      owner: "GOWNER", added_amount: "250", new_voting_power: "900",
    }))).toEqual({ owner: "GOWNER", addedAmount: 250n, newVotingPower: 900n });
  });
  it("parses LockExtended", () => {
    expect(parseLockExtendedEvent(event(["LockExtended", "GOWNER"], {
      owner: "GOWNER", old_end_ledger: 500, new_end_ledger: 700,
    }))).toEqual({ owner: "GOWNER", oldEndLedger: 500, newEndLedger: 700 });
  });
  it("parses LockWithdrawn", () => {
    expect(parseLockWithdrawnEvent(event(["LockWithdrawn", "GOWNER"], {
      owner: "GOWNER", amount: "1000",
    }))).toEqual({ owner: "GOWNER", amount: 1000n });
  });
});

describe("voting rewards event parsers", () => {
  it("parses EpochStarted", () => {
    expect(parseEpochStartedEvent(event(["EpochStarted", "7"], [100, 200]))).toEqual({
      epochId: 7n, startLedger: 100, endLedger: 200,
    });
  });
  it("parses EpochRootPublished", () => {
    expect(parseEpochRootPublishedEvent(event(["EpochRootPublished", "7"], [new Uint8Array([1, 2, 255]), "5000"]))).toEqual({
      epochId: 7n, merkleRoot: "0102ff", totalRewardAmount: 5000n,
    });
  });
  it("parses RewardClaimed", () => {
    expect(parseRewardClaimedEvent(event(["RewardClaimed", "GCLAIMANT"], ["7", "125"]))).toEqual({
      claimant: "GCLAIMANT", epochId: 7n, amount: 125n,
    });
  });
  it("parses PoolFunded", () => {
    expect(parsePoolFundedEvent(event(["PoolFunded", "GFUNDER"], "9000"))).toEqual({
      funder: "GFUNDER", amount: 9000n,
    });
  });
});

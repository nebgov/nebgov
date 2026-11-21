import {
  parseAdminAcceptedEvent,
  parseAdminProposedEvent,
  parseAdminSetEvent,
  parseEpochDurationUpdatedEvent,
  parseEpochRootPublishedEvent,
  parseEpochStartedEvent,
  parseEpochSweptEvent,
  parseEscrowConfigUpdatedEvent,
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
  it("parses EscrowConfigUpdated", () => {
    expect(parseEscrowConfigUpdatedEvent(event(["EscrowConfigUpdated"], {
      old_min_lock_duration: 100,
      new_min_lock_duration: 200,
      old_max_lock_duration: 5000,
      new_max_lock_duration: 10000,
      old_max_multiplier_bps: 10000,
      new_max_multiplier_bps: 20000,
    }))).toEqual({
      oldMinLockDuration: 100,
      newMinLockDuration: 200,
      oldMaxLockDuration: 5000,
      newMaxLockDuration: 10000,
      oldMaxMultiplierBps: 10000,
      newMaxMultiplierBps: 20000,
    });
  });
  it("returns null for EscrowConfigUpdated with missing fields", () => {
    expect(parseEscrowConfigUpdatedEvent(event(["EscrowConfigUpdated"], {
      old_min_lock_duration: 100,
      new_min_lock_duration: 200,
    }))).toBeNull();
  });
  it("returns null for EscrowConfigUpdated with a non-record value", () => {
    expect(parseEscrowConfigUpdatedEvent(event(["EscrowConfigUpdated"], 123))).toBeNull();
  });
  it("ignores non-EscrowConfigUpdated topics", () => {
    expect(parseEscrowConfigUpdatedEvent(event(["LockCreated", "GOWNER"], {
      old_min_lock_duration: 100,
      new_min_lock_duration: 200,
      old_max_lock_duration: 5000,
      new_max_lock_duration: 10000,
      old_max_multiplier_bps: 10000,
      new_max_multiplier_bps: 20000,
    }))).toBeNull();
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
  it("parses EpochSwept", () => {
    expect(parseEpochSweptEvent(event(["EpochSwept", "7"], "4242"))).toEqual({
      epochId: 7n, unclaimedAmount: 4242n,
    });
  });
  it("parses EpochSwept with bigint value (i128 decoded)", () => {
    expect(parseEpochSweptEvent(event(["EpochSwept", "7"], 4242n))).toEqual({
      epochId: 7n, unclaimedAmount: 4242n,
    });
  });
  it("returns null for EpochSwept with a missing epoch topic", () => {
    expect(parseEpochSweptEvent(event(["EpochSwept"], "4242"))).toBeNull();
  });
  it("parses AdminSet (legacy pre-#1658 admin transfer)", () => {
    expect(parseAdminSetEvent(event(["AdminSet"], "GNEWADMIN"))).toEqual({ newAdmin: "GNEWADMIN" });
  });
  it("parses AdminProposed", () => {
    expect(parseAdminProposedEvent(event(["AdminProposed"], "GNEWADMIN"))).toEqual({ newAdmin: "GNEWADMIN" });
  });
  it("parses AdminAccepted", () => {
    expect(parseAdminAcceptedEvent(event(["AdminAccepted"], "GNEWADMIN"))).toEqual({ newAdmin: "GNEWADMIN" });
  });
  it("ignores admin events for other admin topics", () => {
    expect(parseAdminSetEvent(event(["AdminProposed"], "GNEWADMIN"))).toBeNull();
    expect(parseAdminProposedEvent(event(["AdminAccepted"], "GNEWADMIN"))).toBeNull();
    expect(parseAdminAcceptedEvent(event(["AdminSet"], "GNEWADMIN"))).toBeNull();
  });
  it("parses EpochDurationUpdated", () => {
    expect(parseEpochDurationUpdatedEvent(event(["EpochDurationUpdated"], 12345))).toEqual({
      newDurationLedgers: 12345,
    });
  });
  it("returns null for EpochDurationUpdated with a non-numeric value", () => {
    expect(parseEpochDurationUpdatedEvent(event(["EpochDurationUpdated"], "soon"))).toBeNull();
  });
  it("ignores non-EpochDurationUpdated topics", () => {
    expect(parseEpochDurationUpdatedEvent(event(["EpochStarted", "7"], 12345))).toBeNull();
  });
});

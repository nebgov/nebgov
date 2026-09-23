import { VotingRewardsEpochService } from "../jobs/voting-rewards-epoch";
import * as eligibilityMod from "../voting-rewards/eligibility";
import * as storeMod from "../voting-rewards/store";
import * as publisherMod from "../voting-rewards/publisher";
import type { StoredEpoch } from "../voting-rewards/store";
import type { PublishOutcome } from "../voting-rewards/publisher";

/**
 * Coverage for the voting-rewards epoch job (issue #1290), which has none
 * despite being the component whose mistakes are irreversible: the contract
 * finalizes a published root write-once, so publishing early, twice, or
 * oversized is not correctable after the fact.
 *
 * Fully mocked at the module boundary (chain client, store, eligibility,
 * publisher) rather than DB-backed like the route tests, because what's
 * under test is `runCycle`'s own control flow, not persistence.
 */
describe("VotingRewardsEpochService (issue #1290)", () => {
  const ADDR_A = "GA3I6MVQC2EXERDKLVWNFGGYEHII5ZVWFS4ZUQGKAP3XRJWR7P5FUGQJ";

  function fakeClient(overrides: Record<string, unknown> = {}) {
    return {
      getCurrentEpochId: jest.fn().mockResolvedValue(0n),
      getEpoch: jest.fn(),
      getAvailablePool: jest.fn().mockResolvedValue(1_000_000n),
      ...overrides,
    } as unknown as import("@nebgov/sdk").VotingRewardsClient;
  }

  function storedEpoch(overrides: Partial<StoredEpoch> = {}): StoredEpoch {
    return {
      epochId: 0n,
      startLedger: 1000,
      endLedger: 2000,
      merkleRoot: "aa".repeat(32),
      totalRewardAmount: 500n,
      publishedAt: null,
      publishProposalId: null,
      ...overrides,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("epoch-end detection", () => {
    it("does not compute or publish an epoch the indexer has not fully caught up to", async () => {
      const client = fakeClient({
        getCurrentEpochId: jest.fn().mockResolvedValue(0n),
        getEpoch: jest.fn().mockResolvedValue({
          id: 0n,
          startLedger: 1000,
          endLedger: 2000,
          finalized: false,
          merkleRoot: null,
        }),
      });
      jest.spyOn(publisherMod, "buildVotingRewardsClient").mockReturnValue(client);
      jest.spyOn(storeMod, "getHighestPublishedEpochId").mockResolvedValue(null);
      jest.spyOn(eligibilityMod, "getIndexedLedgerHeight").mockResolvedValue(1500); // < endLedger

      const computeSpy = jest.spyOn(eligibilityMod, "computeEpochEligibility");
      const publishSpy = jest.spyOn(publisherMod, "publishEpochRoot");
      process.env.VOTING_REWARDS_EPOCH_BUDGET = "1000";

      const service = new VotingRewardsEpochService();
      await service.runCycle();

      expect(computeSpy).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });

    it("computes and attempts to publish an epoch once the indexer has caught up past its end ledger", async () => {
      const onchainEpoch = {
        id: 0n,
        startLedger: 1000,
        endLedger: 2000,
        finalized: false,
        merkleRoot: null,
      };
      const client = fakeClient({
        getCurrentEpochId: jest.fn().mockResolvedValue(0n),
        getEpoch: jest.fn().mockResolvedValue(onchainEpoch),
      });
      jest.spyOn(publisherMod, "buildVotingRewardsClient").mockReturnValue(client);
      jest.spyOn(storeMod, "getHighestPublishedEpochId").mockResolvedValue(null);
      jest.spyOn(storeMod, "getEpoch").mockResolvedValue(storedEpoch());
      jest.spyOn(eligibilityMod, "getIndexedLedgerHeight").mockResolvedValue(2000); // == endLedger

      const publishSpy = jest
        .spyOn(publisherMod, "publishEpochRoot")
        .mockResolvedValue({ kind: "published", hash: "deadbeef" } satisfies PublishOutcome);
      process.env.VOTING_REWARDS_EPOCH_BUDGET = "1000";

      const service = new VotingRewardsEpochService();
      await service.runCycle();

      expect(publishSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("eligibility computation and pool sizing", () => {
    it("caps the effective budget at the contract's available pool, not the configured budget, when the pool is smaller", async () => {
      const onchainEpoch = {
        id: 0n,
        startLedger: 1000,
        endLedger: 2000,
        finalized: false,
        merkleRoot: null,
      };
      const client = fakeClient({
        getEpoch: jest.fn().mockResolvedValue(onchainEpoch),
        getAvailablePool: jest.fn().mockResolvedValue(400n), // smaller than budget
      });
      jest.spyOn(publisherMod, "buildVotingRewardsClient").mockReturnValue(client);
      jest.spyOn(storeMod, "getHighestPublishedEpochId").mockResolvedValue(null);
      const getEpochSpy = jest.spyOn(storeMod, "getEpoch");
      getEpochSpy.mockResolvedValueOnce(null); // no stored epoch yet -> compute
      getEpochSpy.mockResolvedValueOnce(storedEpoch({ totalRewardAmount: 400n }));

      const saveSpy = jest.spyOn(storeMod, "saveComputedEpoch").mockResolvedValue(undefined);
      const eligibilitySpy = jest
        .spyOn(eligibilityMod, "computeEpochEligibility")
        .mockResolvedValue({
          allocations: [{ address: ADDR_A, weight: 100n, amount: 400n }],
          totalRewardAmount: 400n,
          totalWeight: 100n,
          uniqueVoters: 1,
        });
      jest.spyOn(eligibilityMod, "getIndexedLedgerHeight").mockResolvedValue(2000);
      jest.spyOn(publisherMod, "publishEpochRoot").mockResolvedValue({
        kind: "skipped",
        reason: "no key configured",
      });
      process.env.VOTING_REWARDS_EPOCH_BUDGET = "1000"; // configured higher than the pool

      const service = new VotingRewardsEpochService();
      await service.runCycle();

      expect(eligibilitySpy).toHaveBeenCalledWith(1000, 2000, 400n);
      expect(saveSpy).toHaveBeenCalled();
    });

    it("never sizes total_reward_amount above the amount computeEpochEligibility actually returns", async () => {
      const onchainEpoch = {
        id: 0n,
        startLedger: 1000,
        endLedger: 2000,
        finalized: false,
        merkleRoot: null,
      };
      const client = fakeClient({
        getEpoch: jest.fn().mockResolvedValue(onchainEpoch),
        getAvailablePool: jest.fn().mockResolvedValue(1_000_000n),
      });
      jest.spyOn(publisherMod, "buildVotingRewardsClient").mockReturnValue(client);
      jest.spyOn(storeMod, "getHighestPublishedEpochId").mockResolvedValue(null);

      const getEpochSpy = jest.spyOn(storeMod, "getEpoch");
      getEpochSpy.mockResolvedValueOnce(null);
      getEpochSpy.mockResolvedValueOnce(storedEpoch({ totalRewardAmount: 750n }));

      const saveSpy = jest.spyOn(storeMod, "saveComputedEpoch").mockResolvedValue(undefined);
      jest.spyOn(eligibilityMod, "computeEpochEligibility").mockResolvedValue({
        allocations: [{ address: ADDR_A, weight: 100n, amount: 750n }],
        totalRewardAmount: 750n,
        totalWeight: 100n,
        uniqueVoters: 1,
      });
      jest.spyOn(eligibilityMod, "getIndexedLedgerHeight").mockResolvedValue(2000);
      jest
        .spyOn(publisherMod, "publishEpochRoot")
        .mockResolvedValue({ kind: "skipped", reason: "no key configured" });
      process.env.VOTING_REWARDS_EPOCH_BUDGET = "2000"; // well above what eligibility computed

      const service = new VotingRewardsEpochService();
      await service.runCycle();

      const savedEpoch = saveSpy.mock.calls[0][0];
      expect(savedEpoch.totalRewardAmount).toBe(750n);
    });
  });

  describe("guard against double-publishing", () => {
    it("does not attempt to publish an epoch the contract already reports finalized, and marks it published instead", async () => {
      const publishedRoot = "bb".repeat(32);
      const onchainEpoch = {
        id: 0n,
        startLedger: 1000,
        endLedger: 2000,
        finalized: true,
        merkleRoot: publishedRoot,
      };
      const client = fakeClient({
        getEpoch: jest.fn().mockResolvedValue(onchainEpoch),
      });
      jest.spyOn(publisherMod, "buildVotingRewardsClient").mockReturnValue(client);
      jest.spyOn(storeMod, "getHighestPublishedEpochId").mockResolvedValue(null);
      jest
        .spyOn(storeMod, "getEpoch")
        .mockResolvedValue(storedEpoch({ merkleRoot: publishedRoot }));
      jest.spyOn(eligibilityMod, "getIndexedLedgerHeight").mockResolvedValue(2000);
      const markSpy = jest.spyOn(storeMod, "markEpochPublished").mockResolvedValue(undefined);
      const publishSpy = jest.spyOn(publisherMod, "publishEpochRoot");
      process.env.VOTING_REWARDS_EPOCH_BUDGET = "1000";

      const service = new VotingRewardsEpochService();
      await service.runCycle();

      expect(publishSpy).not.toHaveBeenCalled();
      expect(markSpy).toHaveBeenCalledWith(0n);
    });

    it("stops walking forward once a cycle skips publishing an epoch, so a later epoch is never published ahead of an unresolved one", async () => {
      const epoch0 = { id: 0n, startLedger: 1000, endLedger: 2000, finalized: false, merkleRoot: null };
      const epoch1 = { id: 1n, startLedger: 2000, endLedger: 3000, finalized: false, merkleRoot: null };
      const client = fakeClient({
        getCurrentEpochId: jest.fn().mockResolvedValue(1n),
        getEpoch: jest.fn().mockImplementation((id: bigint) => (id === 0n ? epoch0 : epoch1)),
      });
      jest.spyOn(publisherMod, "buildVotingRewardsClient").mockReturnValue(client);
      jest.spyOn(storeMod, "getHighestPublishedEpochId").mockResolvedValue(null);
      jest.spyOn(storeMod, "getEpoch").mockResolvedValue(storedEpoch());
      jest.spyOn(eligibilityMod, "getIndexedLedgerHeight").mockResolvedValue(3000);
      const publishSpy = jest
        .spyOn(publisherMod, "publishEpochRoot")
        .mockResolvedValueOnce({ kind: "skipped", reason: "a prior publish proposal is pending" });
      process.env.VOTING_REWARDS_EPOCH_BUDGET = "1000";

      const service = new VotingRewardsEpochService();
      await service.runCycle();

      // Only epoch 0 was attempted; epoch 1 was never reached.
      expect(publishSpy).toHaveBeenCalledTimes(1);
    });

    it("serializes concurrent ticks on the same replica so overlapping timers never run two cycles at once", async () => {
      const onchainEpoch = { id: 0n, startLedger: 1000, endLedger: 2000, finalized: false, merkleRoot: null };
      const client = fakeClient({
        getEpoch: jest.fn().mockResolvedValue(onchainEpoch),
      });
      jest.spyOn(publisherMod, "buildVotingRewardsClient").mockReturnValue(client);
      jest.spyOn(storeMod, "getHighestPublishedEpochId").mockResolvedValue(null);
      jest.spyOn(storeMod, "getEpoch").mockResolvedValue(storedEpoch());
      jest.spyOn(eligibilityMod, "getIndexedLedgerHeight").mockResolvedValue(2000);

      let inFlight = 0;
      let maxConcurrent = 0;
      jest.spyOn(publisherMod, "publishEpochRoot").mockImplementation(async () => {
        inFlight++;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight--;
        return { kind: "published", hash: "deadbeef" };
      });
      process.env.VOTING_REWARDS_EPOCH_BUDGET = "1000";

      const service = new VotingRewardsEpochService();
      // `tick()` is the entry point actually used by the scheduler and is
      // guarded by `this.running`; call it twice back-to-back the way two
      // overlapping timers would.
      await Promise.all([
        (service as unknown as { tick: () => Promise<void> }).tick(),
        (service as unknown as { tick: () => Promise<void> }).tick(),
      ]);

      expect(maxConcurrent).toBe(1);
    });

    it(
      "does not guard against two independently-running replicas racing the same unresolved-proposal check " +
        "(documents the known gap shared with the governance-tuning job's dedup guard, issues #1125/#1126)",
      async () => {
        // `publishEpochRoot`'s "is a publish proposal already pending"
        // check-then-act is per-process only: nothing in the epoch job
        // itself serializes it across replicas. Two processes calling
        // `runCycle` concurrently can both read "no pending proposal" before
        // either has recorded one, and both go on to submit. This test pins
        // that current behavior down so a future fix (e.g. a DB-level
        // advisory lock or a unique constraint on in-flight publish
        // proposals) has something concrete to make fail.
        const onchainEpoch = { id: 0n, startLedger: 1000, endLedger: 2000, finalized: false, merkleRoot: null };
        const replicaAClient = fakeClient({ getEpoch: jest.fn().mockResolvedValue(onchainEpoch) });
        const replicaBClient = fakeClient({ getEpoch: jest.fn().mockResolvedValue(onchainEpoch) });

        jest.spyOn(storeMod, "getHighestPublishedEpochId").mockResolvedValue(null);
        jest.spyOn(storeMod, "getEpoch").mockResolvedValue(storedEpoch());
        jest.spyOn(eligibilityMod, "getIndexedLedgerHeight").mockResolvedValue(2000);

        let submissions = 0;
        jest.spyOn(publisherMod, "publishEpochRoot").mockImplementation(async () => {
          // Both replicas see no pending proposal and submit — the race the
          // check-then-act pattern in `publisher.ts` does not close.
          submissions++;
          return { kind: "proposed", proposalId: BigInt(submissions) };
        });
        process.env.VOTING_REWARDS_EPOCH_BUDGET = "1000";

        const buildClientSpy = jest.spyOn(publisherMod, "buildVotingRewardsClient");
        buildClientSpy.mockReturnValueOnce(replicaAClient).mockReturnValueOnce(replicaBClient);

        const replicaA = new VotingRewardsEpochService();
        const replicaB = new VotingRewardsEpochService();

        await Promise.all([replicaA.runCycle(), replicaB.runCycle()]);

        // Current behavior: both replicas submit. This is the gap the
        // acceptance criteria asks to have coverage for, not a guarantee
        // this repo has since closed.
        expect(submissions).toBe(2);
      },
    );
  });
});

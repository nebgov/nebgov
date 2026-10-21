var mockScValToNative = jest.fn();
var mockGetAccount = jest.fn();
var mockSimulateTransaction = jest.fn();
var mockPrepareTransaction = jest.fn();
var mockSendTransaction = jest.fn();
var mockGetTransaction = jest.fn();

import {
  Account,
  Keypair,
  StrKey,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { OptimisticGovernorClient } from "../optimisticGovernor";
import { OptimisticGovernorError, OptimisticGovernorErrorCode } from "../errors";

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    scValToNative: (...args: unknown[]) => mockScValToNative(...args),
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: jest.fn().mockImplementation(() => ({
        getAccount: mockGetAccount,
        simulateTransaction: mockSimulateTransaction,
        prepareTransaction: mockPrepareTransaction,
        sendTransaction: mockSendTransaction,
        getTransaction: mockGetTransaction,
      })),
    },
  };
});

// The module is mocked below, so decode ScVals through the real implementation.
const realScValToNative: (val: xdr.ScVal) => any =
  jest.requireActual("@stellar/stellar-sdk").scValToNative;

const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 1));
const TARGET = StrKey.encodeContract(Buffer.alloc(32, 2));
const SIM_ACCOUNT = Keypair.random().publicKey();
const DESCRIPTION_HASH = "ab".repeat(32);
const HASH = "txhash";

/** Decode the single contract invocation held by a built transaction. */
function invocation(tx: Transaction) {
  const op = tx.operations[0] as unknown as { func: xdr.HostFunction };
  const call = op.func.invokeContract();
  return {
    fn: call.functionName().toString(),
    args: call.args(),
  };
}

function lastSentInvocation() {
  const sent = mockSendTransaction.mock.calls.at(-1)![0] as Transaction;
  return invocation(sent);
}

describe("OptimisticGovernorClient", () => {
  let client: OptimisticGovernorClient;
  let signer: Keypair;

  beforeEach(() => {
    jest.clearAllMocks();
    // Skip the 1s confirmation polling delay.
    jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);

    signer = Keypair.random();
    mockGetAccount.mockImplementation(async (id: string) => new Account(id, "1"));
    mockPrepareTransaction.mockImplementation(async (tx: Transaction) => tx);
    mockSendTransaction.mockResolvedValue({ status: "PENDING", hash: HASH });
    mockGetTransaction.mockResolvedValue({ status: "SUCCESS", returnValue: {} });
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });
    mockScValToNative.mockImplementation(realScValToNative);

    client = new OptimisticGovernorClient({
      optimisticGovernorAddress: CONTRACT,
      network: "testnet",
      simulationAccount: SIM_ACCOUNT,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("read methods", () => {
    it("getProposal decodes the proposal struct and its state tag", async () => {
      mockScValToNative.mockReturnValue({
        id: "7",
        proposer: SIM_ACCOUNT,
        target: TARGET,
        fn_name: "set_fee",
        calldata: Buffer.from("00", "hex"),
        description_hash: Buffer.alloc(32, 0xab),
        created_ledger: 100,
        challenge_end_ledger: 220,
        objection_votes: "42",
        state: { tag: "ChallengeWindow", values: undefined },
      });

      const proposal = await client.getProposal(7);

      expect(proposal).toMatchObject({
        id: 7n,
        proposer: SIM_ACCOUNT,
        target: TARGET,
        fnName: "set_fee",
        createdLedger: 100,
        challengeEndLedger: 220,
        objectionVotes: 42n,
        state: "ChallengeWindow",
      });
      expect(Buffer.from(proposal.descriptionHash).toString("hex")).toBe(DESCRIPTION_HASH);
    });

    it("getProposal simulates get_proposal from the configured simulation account", async () => {
      mockScValToNative.mockReturnValue({ id: 7, objection_votes: 0, state: "Passed" });

      await client.getProposal(7);

      expect(mockGetAccount).toHaveBeenCalledWith(SIM_ACCOUNT);
      const [tx] = mockSimulateTransaction.mock.calls[0] as [Transaction];
      const { fn, args } = invocation(tx);
      expect(fn).toBe("get_proposal");
      expect(args).toHaveLength(1);
      expect(args[0].switch().name).toBe("scvU64");
      expect(mockSendTransaction).not.toHaveBeenCalled();
    });

    it("getProposal accepts a plain-string state", async () => {
      mockScValToNative.mockReturnValue({ id: 1, objection_votes: 0, state: "Executed" });

      const proposal = await client.getProposal(1);

      expect(proposal.state).toBe("Executed");
    });

    it("getConfig maps the on-chain settings to camelCase", async () => {
      mockScValToNative.mockReturnValue({
        votes_token: TARGET,
        challenge_window_ledgers: 120,
        objection_threshold_bps: 500,
        proposer_bond_amount: "1000000",
        proposer_bond_token: CONTRACT,
      });

      const config = await client.getConfig();

      expect(config).toEqual({
        votesToken: TARGET,
        challengeWindowLedgers: 120,
        objectionThresholdBps: 500,
        proposerBondAmount: 1000000n,
        proposerBondToken: CONTRACT,
      });
      const [tx] = mockSimulateTransaction.mock.calls[0] as [Transaction];
      expect(invocation(tx).fn).toBe("get_config");
      expect(invocation(tx).args).toHaveLength(0);
    });

    it("falls back to the contract address as the simulation source", async () => {
      const noSimClient = new OptimisticGovernorClient({
        optimisticGovernorAddress: CONTRACT,
        network: "testnet",
      });
      // A contract address is not a valid classic account id, so hand back a stand-in account.
      mockGetAccount.mockResolvedValue(new Account(SIM_ACCOUNT, "1"));
      mockScValToNative.mockReturnValue({
        votes_token: TARGET,
        challenge_window_ledgers: 1,
        objection_threshold_bps: 1,
        proposer_bond_amount: 0,
        proposer_bond_token: CONTRACT,
      });

      await noSimClient.getConfig();

      expect(mockGetAccount).toHaveBeenCalledWith(CONTRACT);
    });
  });

  describe("failed simulation", () => {
    it("maps a contract error code in the simulation result to a typed error", async () => {
      mockSimulateTransaction.mockResolvedValue({ error: "HostError: Error(Contract, #5)" });

      const err = await client.getProposal(99).catch((e) => e);

      expect(err).toBeInstanceOf(OptimisticGovernorError);
      expect(err.code).toBe(OptimisticGovernorErrorCode.ProposalNotFound);
      expect(err.message).toBe("Proposal not found");
    });

    it("maps an unrecognised failure to SimulationFailed", async () => {
      mockSimulateTransaction.mockResolvedValue({ error: "rpc exploded" });

      const err = await client.getConfig().catch((e) => e);

      expect(err).toBeInstanceOf(OptimisticGovernorError);
      expect(err.code).toBe(OptimisticGovernorErrorCode.SimulationFailed);
      expect(err.message).toContain("rpc exploded");
    });

    it("treats a simulation with no return value as a failure", async () => {
      mockSimulateTransaction.mockResolvedValue({ result: {} });

      await expect(client.getConfig()).rejects.toBeInstanceOf(OptimisticGovernorError);
    });
  });

  describe("write methods build the expected transaction", () => {
    it("propose sends propose(proposer, target, fn_name, calldata, description_hash)", async () => {
      mockScValToNative.mockReturnValue(5n);

      const id = await client.propose(
        signer,
        TARGET,
        "set_fee",
        Buffer.from("0102", "hex"),
        DESCRIPTION_HASH,
      );

      expect(id).toBe(5);
      const { fn, args } = lastSentInvocation();
      expect(fn).toBe("propose");
      expect(args.map((a) => a.switch().name)).toEqual([
        "scvAddress",
        "scvAddress",
        "scvSymbol",
        "scvBytes",
        "scvBytes",
      ]);
      expect(realScValToNative(args[0])).toBe(signer.publicKey());
      expect(realScValToNative(args[1])).toBe(TARGET);
      expect(realScValToNative(args[2])).toBe("set_fee");
      expect(Buffer.from(realScValToNative(args[3])).toString("hex")).toBe("0102");
      expect(Buffer.from(realScValToNative(args[4])).toString("hex")).toBe(DESCRIPTION_HASH);
    });

    it("propose signs the prepared transaction with the proposer", async () => {
      mockScValToNative.mockReturnValue(1n);

      await client.propose(signer, TARGET, "set_fee", Buffer.alloc(0), DESCRIPTION_HASH);

      const sent = mockSendTransaction.mock.calls[0][0] as Transaction;
      expect(sent.source).toBe(signer.publicKey());
      expect(sent.signatures).toHaveLength(1);
      expect(sent.networkPassphrase).toBe("Test SDF Network ; September 2015");
    });

    it("propose rejects a description hash that is not 32 bytes", async () => {
      await expect(
        client.propose(signer, TARGET, "set_fee", Buffer.alloc(0), "abcd"),
      ).rejects.toThrow();
      expect(mockSendTransaction).not.toHaveBeenCalled();
    });

    it("object sends object(objector, proposal_id) and returns the tx hash", async () => {
      const hash = await client.object(signer, 3);

      expect(hash).toBe(HASH);
      const { fn, args } = lastSentInvocation();
      expect(fn).toBe("object");
      expect(args.map((a) => a.switch().name)).toEqual(["scvAddress", "scvU64"]);
      expect(realScValToNative(args[0])).toBe(signer.publicKey());
      expect(realScValToNative(args[1])).toBe(3n);
    });

    it("finalize sends finalize(proposal_id) and returns the refreshed state", async () => {
      mockScValToNative.mockReturnValue({ id: 3, objection_votes: 0, state: { tag: "Passed" } });

      const result = await client.finalize(signer, 3);

      expect(result).toEqual({ state: "Passed" });
      const { fn, args } = lastSentInvocation();
      expect(fn).toBe("finalize");
      expect(args).toHaveLength(1);
      expect(mockSimulateTransaction).toHaveBeenCalledTimes(1);
    });

    it("execute sends execute(proposal_id) and returns the tx hash", async () => {
      const hash = await client.execute(signer, 3);

      expect(hash).toBe(HASH);
      const { fn, args } = lastSentInvocation();
      expect(fn).toBe("execute");
      expect(args).toHaveLength(1);
      expect(args[0].switch().name).toBe("scvU64");
    });

    it("cancel sends cancel(caller, proposal_id)", async () => {
      const hash = await client.cancel(signer, 3);

      expect(hash).toBe(HASH);
      const { fn, args } = lastSentInvocation();
      expect(fn).toBe("cancel");
      expect(args.map((a) => a.switch().name)).toEqual(["scvAddress", "scvU64"]);
      expect(realScValToNative(args[0])).toBe(signer.publicKey());
    });

    it("updateConfig sends update_config(admin, window, threshold_bps)", async () => {
      const hash = await client.updateConfig(signer, 240, 750);

      expect(hash).toBe(HASH);
      const { fn, args } = lastSentInvocation();
      expect(fn).toBe("update_config");
      expect(args.map((a) => a.switch().name)).toEqual(["scvAddress", "scvU32", "scvU32"]);
      expect(realScValToNative(args[1])).toBe(240);
      expect(realScValToNative(args[2])).toBe(750);
    });
  });

  describe("wallet-signing variants", () => {
    const signUnsignedXdr = jest.fn();

    beforeEach(() => {
      signUnsignedXdr.mockReset();
      // Echo the prepared envelope back, as a wallet that signs without altering it.
      signUnsignedXdr.mockImplementation(async (xdrString: string) => xdrString);
      // Stand in for the unsigned prepared tx; `toXDR` is what the wallet receives.
      mockPrepareTransaction.mockImplementation(async (tx: Transaction) => tx);
    });

    it("objectWithSign passes the unsigned XDR to the wallet and submits the signed result", async () => {
      const hash = await client.objectWithSign(signer.publicKey(), 4, signUnsignedXdr);

      expect(hash).toBe(HASH);
      expect(signUnsignedXdr).toHaveBeenCalledTimes(1);
      const submitted = mockSendTransaction.mock.calls[0][0] as Transaction;
      expect(submitted).toBeInstanceOf(Transaction);
      const { fn, args } = invocation(submitted);
      expect(fn).toBe("object");
      expect(realScValToNative(args[0])).toBe(signer.publicKey());
      expect(realScValToNative(args[1])).toBe(4n);
    });

    it("proposeWithSign returns the proposal id", async () => {
      mockScValToNative.mockReturnValue(9n);

      const id = await client.proposeWithSign(
        signer.publicKey(),
        TARGET,
        "set_fee",
        Buffer.alloc(0),
        DESCRIPTION_HASH,
        signUnsignedXdr,
      );

      expect(id).toBe(9);
      expect(lastSentInvocation().fn).toBe("propose");
    });

    it("cancelWithSign and executeWithSign target the matching entrypoints", async () => {
      await client.cancelWithSign(signer.publicKey(), 2, signUnsignedXdr);
      expect(lastSentInvocation().fn).toBe("cancel");

      await client.executeWithSign(signer.publicKey(), 2, signUnsignedXdr);
      expect(lastSentInvocation().fn).toBe("execute");
    });

    it("finalizeWithSign returns the refreshed state", async () => {
      mockScValToNative.mockReturnValue({ id: 2, objection_votes: 0, state: "Passed" });

      const result = await client.finalizeWithSign(signer.publicKey(), 2, signUnsignedXdr);

      expect(result).toEqual({ state: "Passed" });
      expect(lastSentInvocation().fn).toBe("finalize");
    });

    it("does not submit when the wallet refuses to sign", async () => {
      signUnsignedXdr.mockRejectedValue(new Error("User declined"));

      await expect(client.objectWithSign(signer.publicKey(), 4, signUnsignedXdr)).rejects.toThrow(
        "User declined",
      );
      expect(mockSendTransaction).not.toHaveBeenCalled();
    });

    it("round-trips the envelope through TransactionBuilder.fromXDR", async () => {
      const fromXdr = jest.spyOn(TransactionBuilder, "fromXDR");

      await client.executeWithSign(signer.publicKey(), 2, signUnsignedXdr);

      expect(fromXdr).toHaveBeenCalledWith(expect.any(String), "Test SDF Network ; September 2015");
    });
  });

  describe("error mapping for failed transactions", () => {
    it("maps a contract error from a rejected submission", async () => {
      mockSendTransaction.mockResolvedValue({
        status: "ERROR",
        error: "Error(Contract, #10)",
      });

      const err = await client.object(signer, 3).catch((e) => e);

      expect(err).toBeInstanceOf(OptimisticGovernorError);
      expect(err.code).toBe(OptimisticGovernorErrorCode.NoVotingPower);
      expect(mockGetTransaction).not.toHaveBeenCalled();
    });

    it("maps a non-contract rejection to TransactionFailed", async () => {
      mockSendTransaction.mockResolvedValue({ status: "ERROR", error: "tx_bad_seq" });

      const err = await client.execute(signer, 3).catch((e) => e);

      expect(err).toBeInstanceOf(OptimisticGovernorError);
      expect(err.code).toBe(OptimisticGovernorErrorCode.TransactionFailed);
      expect(err.message).toContain("tx_bad_seq");
    });

    it("maps a contract error from a transaction that failed on-chain", async () => {
      mockGetTransaction.mockResolvedValue({
        status: "FAILED",
        error: "Error(Contract, #9)",
      });

      const err = await client.object(signer, 3).catch((e) => e);

      expect(err).toBeInstanceOf(OptimisticGovernorError);
      expect(err.code).toBe(OptimisticGovernorErrorCode.AlreadyObjected);
    });

    it("keeps polling while the transaction is not found, then succeeds", async () => {
      mockGetTransaction
        .mockResolvedValueOnce({ status: "NOT_FOUND" })
        .mockResolvedValueOnce({ status: "NOT_FOUND" })
        .mockResolvedValueOnce({ status: "SUCCESS", returnValue: {} });

      const hash = await client.execute(signer, 3);

      expect(hash).toBe(HASH);
      expect(mockGetTransaction).toHaveBeenCalledTimes(3);
    });

    it("gives up with a typed error after 20 unconfirmed polls", async () => {
      mockGetTransaction.mockResolvedValue({ status: "NOT_FOUND" });

      const err = await client.execute(signer, 3).catch((e) => e);

      expect(err).toBeInstanceOf(OptimisticGovernorError);
      expect(err.message).toContain("timed out");
      expect(mockGetTransaction).toHaveBeenCalledTimes(20);
    });
  });

  describe("indexer-backed methods", () => {
    const originalFetch = global.fetch;
    let mockFetch: jest.Mock;
    let indexed: OptimisticGovernorClient;

    beforeEach(() => {
      mockFetch = jest.fn();
      global.fetch = mockFetch as unknown as typeof fetch;
      indexed = new OptimisticGovernorClient({
        optimisticGovernorAddress: CONTRACT,
        network: "testnet",
        indexerUrl: "https://indexer.example.com",
      });
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it("listProposals throws without an indexerUrl", async () => {
      await expect(client.listProposals()).rejects.toThrow("indexerUrl is required");
      await expect(client.getObjections(1)).rejects.toThrow("indexerUrl is required");
    });

    it("listProposals maps indexer rows and translates the status filter", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              proposal_id: "11",
              proposer: SIM_ACCOUNT,
              created_ledger: 10,
              challenge_end_ledger: 130,
              objection_votes: "5",
              state: "challenge_window",
            },
            {
              proposal_id: "12",
              proposer: SIM_ACCOUNT,
              created_ledger: 11,
              challenge_end_ledger: 131,
              state: "unknown_state",
            },
          ],
        }),
      });

      const proposals = await indexed.listProposals("ChallengeWindow");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://indexer.example.com/optimistic/proposals?status=challenge_window",
      );
      expect(proposals).toHaveLength(2);
      expect(proposals[0]).toMatchObject({
        id: 11n,
        proposer: SIM_ACCOUNT,
        createdLedger: 10,
        challengeEndLedger: 130,
        objectionVotes: 5n,
        state: "ChallengeWindow",
      });
      // Missing objection_votes default to zero; unknown states fall back to ChallengeWindow.
      expect(proposals[1].objectionVotes).toBe(0n);
      expect(proposals[1].state).toBe("ChallengeWindow");
    });

    it("listProposals omits the query string when no status is given", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

      await indexed.listProposals();

      expect(mockFetch).toHaveBeenCalledWith("https://indexer.example.com/optimistic/proposals");
    });

    it("listProposals surfaces a failed indexer response", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 });

      await expect(indexed.listProposals()).rejects.toThrow("Indexer request failed: 503");
    });

    it("getObjections maps rows to typed objections", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              proposal_id: "11",
              objector: SIM_ACCOUNT,
              weight: "100",
              running_total: "100",
              ledger: 55,
            },
          ],
        }),
      });

      const objections = await indexed.getObjections(11);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://indexer.example.com/optimistic/proposals/11/objections",
      );
      expect(objections).toEqual([
        { proposalId: 11n, objector: SIM_ACCOUNT, weight: 100n, runningTotal: 100n, ledger: 55 },
      ]);
    });

    it("getObjections surfaces a failed indexer response", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(indexed.getObjections(11)).rejects.toThrow("Indexer request failed: 500");
    });
  });
});

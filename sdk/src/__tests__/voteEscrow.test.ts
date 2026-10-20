var mockScValToNative = jest.fn();
var mockNativeToScVal = jest.fn();
var mockSimulate = jest.fn();
var mockGetAccount = jest.fn();
var mockGetLatestLedger = jest.fn();
var mockIsSimulationError = jest.fn();
var mockContractCall = jest.fn();

import { VoteEscrowClient } from "../voteEscrow";
import { VoteEscrowErrorCode } from "../errors";

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    scValToNative: mockScValToNative,
    nativeToScVal: mockNativeToScVal,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: mockSimulate,
        getAccount: mockGetAccount,
        getLatestLedger: mockGetLatestLedger,
      })),
      Api: {
        isSimulationError: mockIsSimulationError,
      },
    },
    Contract: jest.fn().mockImplementation((addr) => ({
      call: mockContractCall,
      address: () => addr,
      contractId: () => addr,
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({}),
    })),
  };
});

import { Account } from "@stellar/stellar-sdk";

describe("VoteEscrowClient", () => {
  let client: VoteEscrowClient;
  const validGAddr = "GBFUUXATVOGXGD4KS3I423QFZSPE4ZFOQ3TCJVWFUYSIPULXIRVRE2DT";
  const validCAddr = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccount.mockResolvedValue(new Account(validGAddr, "1"));
    mockGetLatestLedger.mockResolvedValue({ sequence: 100000 });
    mockNativeToScVal.mockReturnValue({});
    mockContractCall.mockReturnValue({});

    client = new VoteEscrowClient({
      voteEscrowAddress: validCAddr,
      network: "testnet",
      maxAttempts: 1,
    });
  });

  describe("constructor", () => {
    const config = {
      voteEscrowAddress: validCAddr,
      network: "testnet" as const,
    };

    it("rejects a missing or malformed vote escrow contract address", () => {
      expect(
        () =>
          new VoteEscrowClient({
            ...config,
            voteEscrowAddress: "" as unknown as string,
          })
      ).toThrow("VoteEscrowClient requires a valid voteEscrowAddress contract ID");
      expect(
        () =>
          new VoteEscrowClient({
            ...config,
            voteEscrowAddress: undefined as unknown as string,
          })
      ).toThrow("VoteEscrowClient requires a valid voteEscrowAddress contract ID");
      expect(
        () =>
          new VoteEscrowClient({
            ...config,
            voteEscrowAddress: "not-a-contract",
          })
      ).toThrow("VoteEscrowClient requires a valid voteEscrowAddress contract ID");
    });
  });

  describe("getLock", () => {
    it("returns null for the contract's LockNotFound error", async () => {
      mockIsSimulationError.mockReturnValue(true);
      mockSimulate.mockResolvedValue({ error: "Error(Contract, #2)" });

      await expect(client.getLock(validGAddr)).resolves.toBeNull();
    });

    it("throws parsed errors for other simulation failures", async () => {
      mockIsSimulationError.mockReturnValue(true);
      mockSimulate.mockResolvedValue({ error: "RPC unavailable" });

      await expect(client.getLock(validGAddr)).rejects.toMatchObject({
        code: VoteEscrowErrorCode.SimulationFailed,
      });
    });
  });

  describe("getVotingPower", () => {
    it("returns zero for the contract's LockNotFound error", async () => {
      mockIsSimulationError.mockReturnValue(true);
      mockSimulate.mockResolvedValue({ error: "Error(Contract, #2)" });

      await expect(client.getVotingPower(validGAddr)).resolves.toBe(0n);
    });

    it("throws parsed errors for other simulation failures", async () => {
      mockIsSimulationError.mockReturnValue(true);
      mockSimulate.mockResolvedValue({ error: "RPC unavailable" });

      await expect(client.getVotingPower(validGAddr)).rejects.toMatchObject({
        code: VoteEscrowErrorCode.SimulationFailed,
      });
    });
  });

  describe("getEscrowStats", () => {
    it("calls get_past_total_supply with the current ledger sequence as its argument", async () => {
      mockIsSimulationError.mockReturnValue(false);
      mockSimulate.mockResolvedValue({ result: { retval: {} } });
      mockScValToNative.mockReturnValue(5000n);

      await client.getEscrowStats();

      expect(mockContractCall).toHaveBeenCalledWith(
        "get_past_total_supply",
        expect.anything(),
      );
      expect(mockNativeToScVal).toHaveBeenCalledWith(100000, { type: "u32" });
    });

    it("returns total_locked from the simulated result and nothing else", async () => {
      mockIsSimulationError.mockReturnValue(false);
      mockSimulate.mockResolvedValue({ result: { retval: {} } });
      mockScValToNative.mockReturnValue(5000n);

      const stats = await client.getEscrowStats();

      expect(stats).toEqual({ total_locked: 5000n });
    });

    it("returns null when the simulation errors", async () => {
      mockIsSimulationError.mockReturnValue(true);
      mockSimulate.mockResolvedValue({ error: "boom" });

      const stats = await client.getEscrowStats();

      expect(stats).toBeNull();
    });

    it("returns null when the retval is missing", async () => {
      mockIsSimulationError.mockReturnValue(false);
      mockSimulate.mockResolvedValue({ result: {} });

      const stats = await client.getEscrowStats();

      expect(stats).toBeNull();
    });

    it("returns null when the reported total is zero", async () => {
      mockIsSimulationError.mockReturnValue(false);
      mockSimulate.mockResolvedValue({ result: { retval: {} } });
      mockScValToNative.mockReturnValue(0n);

      const stats = await client.getEscrowStats();

      expect(stats).toBeNull();
    });
  });
});

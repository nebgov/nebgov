var mockScValToNative = jest.fn();
var mockNativeToScVal = jest.fn();
var mockSimulate = jest.fn();
var mockGetAccount = jest.fn();
var mockGetLatestLedger = jest.fn();
var mockIsSimulationError = jest.fn();
var mockContractCall = jest.fn();

import { VoteEscrowClient } from "../voteEscrow";

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
      governorAddress: validCAddr,
      timelockAddress: validCAddr,
      votesAddress: validCAddr,
      voteEscrowAddress: validCAddr,
      network: "testnet",
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

// Define mocks with 'mock' prefix and use 'var' for hoisting support
var mockScValToNative = jest.fn();
var mockNativeToScVal = jest.fn();
var mockSimulate = jest.fn();
var mockGetAccount = jest.fn();
var mockPrepareTransaction = jest.fn();
var mockSendTransaction = jest.fn();
var mockGetTransaction = jest.fn();
var mockIsSimulationError = jest.fn();

import { GovernorClient } from "../governor";
import { VoteSupport } from "../types";
import {
  GovernorError,
  RpcConnectionError,
  DeserializationError,
} from "../errors";

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
        prepareTransaction: mockPrepareTransaction,
        sendTransaction: mockSendTransaction,
        getTransaction: mockGetTransaction,
      })),
      Api: {
        isSimulationError: mockIsSimulationError,
        GetTransactionStatus: {
          SUCCESS: "SUCCESS",
          FAILED: "FAILED",
          NOT_FOUND: "NOT_FOUND",
        },
      },
    },
    Contract: jest.fn().mockImplementation((addr) => ({
      call: jest.fn().mockReturnValue({}),
      address: () => addr,
      contractId: () => "C123",
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({}),
    })),
  };
});

import { xdr, Account, Keypair } from "@stellar/stellar-sdk";

describe("GovernorClient error scenarios", () => {
  let client: GovernorClient;
  const validGAddr = "GBFUUXATVOGXGD4KS3I423QFZSPE4ZFOQ3TCJVWFUYSIPULXIRVRE2DT";
  const validCAddr = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
  const mockKeypair = Keypair.random();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccount.mockResolvedValue(new Account(validGAddr, "1"));
    mockIsSimulationError.mockReturnValue(false);
    mockNativeToScVal.mockReturnValue({} as xdr.ScVal);

    client = new GovernorClient({
      governorAddress: validCAddr,
      timelockAddress: validCAddr,
      votesAddress: validCAddr,
      network: "testnet",
      maxAttempts: 1, // Minimize retry delay in tests
      baseDelayMs: 1,
    });
  });

  it("throws RpcConnectionError when RPC is unreachable", async () => {
    mockSimulate.mockRejectedValue(new Error("fetch failed: connection refused"));
    await expect(client.getProposal(1n)).rejects.toThrow(RpcConnectionError);
  });

  it("throws ContractPanic when contract panics on invalid proposal", async () => {
    const mockTx = { sign: jest.fn() };
    mockPrepareTransaction.mockResolvedValue(mockTx);
    mockSendTransaction.mockResolvedValue({
      status: "ERROR",
      error: "HostError: panic occurred in contract",
    });

    await expect(
      client.propose(
        mockKeypair,
        "Test proposal",
        "3665313936616466316231366230623362346231613963316131613262336334",
        "ipfs://QmTest",
        [validCAddr],
        ["upgrade"],
        [Buffer.from([1, 2, 3])]
      )
    ).rejects.toThrow(GovernorError.ContractPanic);
  });

  it("throws ProposalNotFound when voting on non-existent proposal", async () => {
    mockSendTransaction.mockResolvedValue({
      status: "ERROR",
      error: "Error(Contract, #20)",
    });

    await expect(client.vote(mockKeypair, 999n, VoteSupport.For)).rejects.toThrow(
      GovernorError.ProposalNotFound
    );
  });

  it("throws VotingPeriodClosed when voting after voting period ends", async () => {
    mockSendTransaction.mockResolvedValue({
      status: "ERROR",
      error: "Error(Contract, #31)",
    });

    await expect(client.vote(mockKeypair, 1n, VoteSupport.For)).rejects.toThrow(
      GovernorError.VotingPeriodClosed
    );
  });

  it("throws with retry exhausted message when RPC timeout is exceeded (30s exceeded)", async () => {
    const mockTx = { sign: jest.fn() };
    mockPrepareTransaction.mockResolvedValue(mockTx);
    mockSendTransaction.mockResolvedValue({
      status: "PENDING",
      hash: "mock-tx-hash",
    });
    mockGetTransaction.mockResolvedValue({
      status: "NOT_FOUND",
    });

    // Let's set maxAttempts to 2 to verify it actually exhausts retries and throws the error
    client = new GovernorClient({
      governorAddress: validCAddr,
      timelockAddress: validCAddr,
      votesAddress: validCAddr,
      network: "testnet",
      maxAttempts: 2,
      baseDelayMs: 1,
    });

    await expect(client.execute(mockKeypair, 1n)).rejects.toThrow(
      /Retry attempts exhausted: Transaction not confirmed after 10 retries/
    );
  });

  it("throws DeserializationError on malformed XDR response", async () => {
    const scv = {} as xdr.ScVal;
    mockSimulate.mockResolvedValue({
      result: { retval: scv },
    });
    mockScValToNative.mockImplementation(() => {
      throw new Error("Unable to decode ScVal");
    });

    await expect(client.getProposalVotes(1n)).rejects.toThrow(
      DeserializationError
    );
  });

  it("throws AlreadyVoted when user votes twice", async () => {
    mockSendTransaction.mockResolvedValue({
      status: "ERROR",
      error: "Error(Contract, #12)",
    });

    await expect(client.vote(mockKeypair, 1n, VoteSupport.For)).rejects.toThrow(
      GovernorError.AlreadyVoted
    );
  });

  it("throws ProposalNotSucceeded when queuing before vote period ends", async () => {
    mockSendTransaction.mockResolvedValue({
      status: "ERROR",
      error: "Error(Contract, #14)",
    });

    await expect(client.queue(mockKeypair, 1n)).rejects.toThrow(
      GovernorError.ProposalNotSucceeded
    );
  });
});

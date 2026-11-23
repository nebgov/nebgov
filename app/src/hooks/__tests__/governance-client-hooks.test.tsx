/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { Keypair, scValToNative } from "@stellar/stellar-sdk";
import { useSplitDelegation } from "../useSplitDelegation";
import { useGaslessDelegation } from "../useGaslessDelegation";
import { useGovernorConfig } from "../useGovernorConfig";

const mockVotesClient = {
  getSplitDelegations: jest.fn(),
  delegateSplitWithSign: jest.fn(),
  undelegateSplitWithSign: jest.fn(),
  wouldCreateCycle: jest.fn(),
  getDelegationDepthLimit: jest.fn(),
  getChainDepth: jest.fn(),
};

const mockDelegationSigClient = {
  currentLedger: jest.fn(),
  signDelegationPermit: jest.fn(),
  invalidateAllPermitsWithSign: jest.fn(),
};

jest.mock("@nebgov/sdk", () => ({
  VotesClient: jest.fn().mockImplementation(() => mockVotesClient),
  DelegationSigClient: jest.fn().mockImplementation(() => mockDelegationSigClient),
}));

const mockUseWallet = jest.fn();

jest.mock("../../lib/wallet-context", () => ({
  useWallet: () => mockUseWallet(),
}));

const backendFetchMock = jest.fn();

jest.mock("../../lib/backend", () => ({
  backendBaseUrl: () => "http://localhost:3001",
  backendFetch: (...args: unknown[]) => backendFetchMock(...args),
}));

const mockServer = {
  getAccount: jest.fn().mockResolvedValue({}),
  simulateTransaction: jest.fn(),
};

const mockTxBuilder = {
  addOperation: jest.fn().mockReturnThis(),
  setTimeout: jest.fn().mockReturnThis(),
  build: jest.fn().mockReturnValue("built-tx"),
};

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: jest.fn().mockImplementation(() => mockServer),
      Api: {
        ...actual.SorobanRpc.Api,
        isSimulationError: jest.fn(() => false),
      },
    },
    TransactionBuilder: jest.fn().mockImplementation(() => mockTxBuilder),
    Contract: jest.fn().mockImplementation(() => ({ call: jest.fn() })),
    scValToNative: jest.fn(),
  };
});

const WALLET = {
  publicKey: Keypair.random().publicKey(),
  isConnected: true,
  signTransaction: jest.fn().mockResolvedValue("signed-tx"),
  signAuthEntry: jest.fn().mockResolvedValue("c2lnbmVkLWF1dGg="),
  signMessage: jest.fn(),
};

function setGovernorEnv() {
  process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS = "CGOVERNOR";
  process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS = "CTIMELOCK";
  process.env.NEXT_PUBLIC_VOTES_ADDRESS = "CVOTES";
  process.env.NEXT_PUBLIC_NETWORK = "testnet";
}

describe("useSplitDelegation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setGovernorEnv();
    mockUseWallet.mockReturnValue(WALLET);
    mockVotesClient.getSplitDelegations.mockResolvedValue([
      { delegatee: WALLET.publicKey, weightBps: 10000 },
    ]);
  });

  it("does nothing when no address is provided", async () => {
    const { result } = renderHook(() => useSplitDelegation(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.splits).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockVotesClient.getSplitDelegations).not.toHaveBeenCalled();
  });

  it("loads the current split delegations", async () => {
    const { result } = renderHook(() => useSplitDelegation(WALLET.publicKey));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.splits).toEqual([
      { delegatee: WALLET.publicKey, weightBps: 10000 },
    ]);
  });

  it("exposes load errors", async () => {
    mockVotesClient.getSplitDelegations.mockRejectedValueOnce(new Error("rpc offline"));
    const { result } = renderHook(() => useSplitDelegation(WALLET.publicKey));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("rpc offline");
    expect(result.current.splits).toEqual([]);
  });

  it("reports a not-configured environment", async () => {
    delete process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;
    const { result } = renderHook(() => useSplitDelegation(WALLET.publicKey));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("Missing NEXT_PUBLIC_");
    expect(mockVotesClient.getSplitDelegations).not.toHaveBeenCalled();
  });

  it("delegates and undelegates splits through the SDK client", async () => {
    mockVotesClient.delegateSplitWithSign.mockResolvedValue("DELEGATE_HASH");
    mockVotesClient.undelegateSplitWithSign.mockResolvedValue("UNDELEGATE_HASH");

    const { result } = renderHook(() => useSplitDelegation(WALLET.publicKey));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const splits = [{ delegatee: Keypair.random().publicKey(), weightBps: 5000 }];
    let hash: string | undefined;
    await act(async () => {
      hash = await result.current.delegateSplit(splits);
    });
    expect(hash).toBe("DELEGATE_HASH");
    expect(mockVotesClient.delegateSplitWithSign).toHaveBeenCalledWith(
      WALLET.publicKey,
      splits,
      WALLET.signTransaction,
    );

    await act(async () => {
      hash = await result.current.undelegateSplit();
    });
    expect(hash).toBe("UNDELEGATE_HASH");
    expect(result.current.submitting).toBe(false);
  });

  it("requires a connected wallet to submit", async () => {
    mockUseWallet.mockReturnValue({ ...WALLET, publicKey: null, isConnected: false });
    const { result } = renderHook(() => useSplitDelegation(WALLET.publicKey));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => result.current.delegateSplit([])),
    ).rejects.toThrow("Connect your wallet first.");
  });
});

describe("useGaslessDelegation", () => {
  const delegatee = Keypair.random().publicKey();

  beforeEach(() => {
    jest.clearAllMocks();
    setGovernorEnv();
    mockUseWallet.mockReturnValue(WALLET);
    mockDelegationSigClient.currentLedger.mockResolvedValue(100);
    mockDelegationSigClient.signDelegationPermit.mockResolvedValue({
      permit: {
        delegator: WALLET.publicKey,
        delegatee,
        nonce: 7n,
        expiryLedger: 121060,
        chainId: "chain-id",
        contractId: "CVOTES",
      },
      authEntry: "signed-auth-entry",
    });
    mockDelegationSigClient.invalidateAllPermitsWithSign.mockResolvedValue({
      hash: "INVALIDATE_HASH",
    });
    backendFetchMock.mockResolvedValue({ txHash: "RELAY_HASH", nonce: 7 });
    mockVotesClient.wouldCreateCycle.mockResolvedValue(false);
    mockVotesClient.getDelegationDepthLimit.mockResolvedValue(3);
    mockVotesClient.getChainDepth.mockResolvedValue(0);
  });

  it("rejects empty and invalid delegatee addresses in preflight", async () => {
    const { result } = renderHook(() => useGaslessDelegation());

    await expect(result.current.preflightDelegatee("  ")).resolves.toEqual({
      ok: false,
      error: "Address is required.",
    });
    await expect(result.current.preflightDelegatee("not-an-address")).resolves.toEqual({
      ok: false,
      error: "Invalid Stellar address.",
    });
  });

  it("requires a connected wallet", async () => {
    mockUseWallet.mockReturnValue({ ...WALLET, publicKey: null, isConnected: false });
    const { result } = renderHook(() => useGaslessDelegation());

    await expect(result.current.preflightDelegatee(delegatee)).resolves.toEqual({
      ok: false,
      error: "Connect your wallet first.",
    });
    await expect(result.current.delegateGasless(delegatee, "1week")).rejects.toThrow(
      "Connect your wallet first.",
    );
    await expect(result.current.invalidateAllPermits()).rejects.toThrow(
      "Connect your wallet first.",
    );
  });

  it("passes preflight when cycle and depth checks succeed", async () => {
    const { result } = renderHook(() => useGaslessDelegation());
    await expect(result.current.preflightDelegatee(delegatee)).resolves.toEqual({ ok: true });
    expect(mockVotesClient.wouldCreateCycle).toHaveBeenCalledWith(
      WALLET.publicKey,
      delegatee,
    );
  });

  it("fails preflight on cycles and depth-limit violations", async () => {
    mockVotesClient.wouldCreateCycle.mockResolvedValueOnce(true);
    const { result } = renderHook(() => useGaslessDelegation());
    await expect(result.current.preflightDelegatee(delegatee)).resolves.toEqual({
      ok: false,
      error: "This delegation would create a cycle.",
    });

    mockVotesClient.getChainDepth.mockResolvedValueOnce(3);
    await expect(result.current.preflightDelegatee(delegatee)).resolves.toEqual({
      ok: false,
      error: "This delegation would exceed the maximum delegation depth of 3.",
    });
  });

  it("signs a permit and submits it through the backend relayer", async () => {
    const { result } = renderHook(() => useGaslessDelegation());

    let delegation: { txHash: string; nonce?: number } | undefined;
    await act(async () => {
      delegation = await result.current.delegateGasless(delegatee, "1week");
    });

    expect(delegation).toEqual({ txHash: "RELAY_HASH", nonce: 7 });
    expect(mockDelegationSigClient.currentLedger).toHaveBeenCalled();
    expect(backendFetchMock).toHaveBeenCalledWith(
      "/relayer/delegate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes delegation errors", async () => {
    backendFetchMock.mockRejectedValueOnce(new Error("relayer down"));
    const { result } = renderHook(() => useGaslessDelegation());

    await act(async () => {
      await expect(
        result.current.delegateGasless(delegatee, "1month"),
      ).rejects.toThrow("relayer down");
    });
    expect(result.current.error).toBe("relayer down");
  });

  it("invalidates all permits with a wallet-signed transaction", async () => {
    const { result } = renderHook(() => useGaslessDelegation());

    let res: { txHash: string } | undefined;
    await act(async () => {
      res = await result.current.invalidateAllPermits();
    });

    expect(res).toEqual({ txHash: "INVALIDATE_HASH" });
    expect(mockDelegationSigClient.invalidateAllPermitsWithSign).toHaveBeenCalledWith(
      WALLET.publicKey,
      WALLET.signTransaction,
    );
    expect(backendFetchMock).not.toHaveBeenCalled();
  });
});

describe("useGovernorConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setGovernorEnv();
    mockServer.simulateTransaction.mockResolvedValue({ result: { retval: {} } });
    (scValToNative as jest.Mock)
      .mockReturnValueOnce("GTOKEN")
      .mockReturnValueOnce(9);
  });

  it("returns the Stellar-native defaults while loading", () => {
    const { result } = renderHook(() => useGovernorConfig());
    expect(result.current).toEqual({ decimals: 7, divisor: 10_000_000 });
  });

  it("reads token decimals from chain and derives the divisor", async () => {
    const { result } = renderHook(() => useGovernorConfig());

    await waitFor(() => expect(result.current.decimals).toBe(9));
    expect(result.current.divisor).toBe(1_000_000_000);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(2);
  });

  it("keeps defaults when the RPC query fails", async () => {
    mockServer.simulateTransaction.mockRejectedValue(new Error("rpc down"));
    const { result } = renderHook(() => useGovernorConfig());

    await waitFor(() => expect(mockServer.simulateTransaction).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toEqual({ decimals: 7, divisor: 10_000_000 });
  });

  it("keeps defaults when votes address is not configured", async () => {
    delete process.env.NEXT_PUBLIC_VOTES_ADDRESS;
    const { result } = renderHook(() => useGovernorConfig());

    await act(async () => {});
    expect(result.current).toEqual({ decimals: 7, divisor: 10_000_000 });
    expect(mockServer.simulateTransaction).not.toHaveBeenCalled();
  });
});

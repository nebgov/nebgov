/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ProposerReputation } from "@nebgov/sdk";
import { useProposerReputation } from "../useProposerReputation";

const getProposerReputationMock = jest.fn();
const ReputationClientMock = jest.fn();

jest.mock("@nebgov/sdk", () => ({
  ReputationClient: function (...args: unknown[]) {
    ReputationClientMock(...args);
    return {
      getProposerReputation: (...a: unknown[]) => getProposerReputationMock(...a),
    };
  },
}));

function makeReputation(proposer: string, reputationScore = 250): ProposerReputation {
  return {
    proposer,
    totalProposals: 4,
    totalParticipationBpsSum: 12000n,
    lastProposalLedger: 900,
    reputationScore,
    thresholdMultiplierBps: 9000,
    firstProposalLedger: 100,
    consecutiveSuccessful: 2,
    consecutiveFailed: 0,
  };
}

describe("useProposerReputation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("starts in a loading state with no reputation or error", () => {
    getProposerReputationMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useProposerReputation("GPROPOSER"));

    expect(result.current.loading).toBe(true);
    expect(result.current.reputation).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("stops loading without fetching when no address is given", async () => {
    const { result } = renderHook(() => useProposerReputation(undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reputation).toBeNull();
    expect(result.current.error).toBeNull();
    expect(ReputationClientMock).not.toHaveBeenCalled();
  });

  it("loads the reputation record for the address", async () => {
    const reputation = makeReputation("GPROPOSER");
    getProposerReputationMock.mockResolvedValue(reputation);
    const { result } = renderHook(() => useProposerReputation("GPROPOSER"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(ReputationClientMock).toHaveBeenCalledWith({
      governorAddress: "CTEST123...",
      timelockAddress: "CTEST456...",
      votesAddress: "CTEST789...",
      network: "testnet",
    });
    expect(getProposerReputationMock).toHaveBeenCalledWith("GPROPOSER");
    expect(result.current.reputation).toEqual(reputation);
    expect(result.current.error).toBeNull();
  });

  it("passes the RPC URL to the client when configured", async () => {
    process.env.NEXT_PUBLIC_RPC_URL = "https://rpc.example.com";
    getProposerReputationMock.mockResolvedValue(makeReputation("GPROPOSER"));
    const { result } = renderHook(() => useProposerReputation("GPROPOSER"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(ReputationClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ rpcUrl: "https://rpc.example.com" }),
    );
  });

  it("surfaces the error message when the client rejects", async () => {
    getProposerReputationMock.mockRejectedValue(new Error("rpc timeout"));
    const { result } = renderHook(() => useProposerReputation("GPROPOSER"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("rpc timeout");
    expect(result.current.reputation).toBeNull();
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    getProposerReputationMock.mockRejectedValue("boom");
    const { result } = renderHook(() => useProposerReputation("GPROPOSER"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load proposer reputation");
  });

  it("errors without calling the client when required env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_VOTES_ADDRESS;
    const { result } = renderHook(() => useProposerReputation("GPROPOSER"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(
      "Missing required environment variables for ReputationClient",
    );
    expect(ReputationClientMock).not.toHaveBeenCalled();
  });

  it("refetches when the address changes", async () => {
    getProposerReputationMock.mockImplementation(async (address: string) =>
      makeReputation(address),
    );
    const { result, rerender } = renderHook(
      ({ address }: { address: string | undefined }) => useProposerReputation(address),
      { initialProps: { address: "GFIRST" } },
    );

    await waitFor(() => expect(result.current.reputation?.proposer).toBe("GFIRST"));

    rerender({ address: "GSECOND" });

    await waitFor(() => expect(result.current.reputation?.proposer).toBe("GSECOND"));
    expect(getProposerReputationMock).toHaveBeenCalledTimes(2);
    expect(getProposerReputationMock).toHaveBeenLastCalledWith("GSECOND");
  });

  it("ignores a stale response that resolves after the address changed", async () => {
    let resolveFirst!: (value: ProposerReputation) => void;
    getProposerReputationMock
      .mockReturnValueOnce(
        new Promise<ProposerReputation>((r) => {
          resolveFirst = r;
        }),
      )
      .mockResolvedValueOnce(makeReputation("GSECOND"));

    const { result, rerender } = renderHook(
      ({ address }: { address: string | undefined }) => useProposerReputation(address),
      { initialProps: { address: "GFIRST" } },
    );

    rerender({ address: "GSECOND" });
    await waitFor(() => expect(result.current.reputation?.proposer).toBe("GSECOND"));

    await act(async () => {
      resolveFirst(makeReputation("GFIRST"));
    });

    expect(result.current.reputation?.proposer).toBe("GSECOND");
    expect(result.current.loading).toBe(false);
  });
});

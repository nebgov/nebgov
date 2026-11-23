/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { VotesClient } from "@nebgov/sdk";
import { useGovernanceBalance } from "../../lib/use-governance-balance";

const mockClient = {
  getBaseVotes: jest.fn(),
  getVotes: jest.fn(),
  getDelegatee: jest.fn(),
};

jest.mock("@nebgov/sdk", () => ({
  VotesClient: jest.fn().mockImplementation(() => mockClient),
}));

const ACCOUNT = "GACCOUNTUNDERTEST";

describe("useGovernanceBalance", () => {
  const savedGovernor = process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS = "CGOVERNOR";
    mockClient.getBaseVotes.mockResolvedValue(100n);
    mockClient.getVotes.mockResolvedValue(250n);
    mockClient.getDelegatee.mockResolvedValue("GDELEGATE");
  });

  afterEach(() => {
    if (savedGovernor === undefined) {
      delete process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;
    } else {
      process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS = savedGovernor;
    }
  });

  it("loads base votes, voting power and delegatee for the address", async () => {
    const { result } = renderHook(() => useGovernanceBalance(ACCOUNT));

    await waitFor(() => expect(result.current.votingPower).toBe(250n));

    expect(result.current.baseVotes).toBe(100n);
    expect(result.current.delegatee).toBe("GDELEGATE");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockClient.getBaseVotes).toHaveBeenCalledWith(ACCOUNT);
    expect(mockClient.getVotes).toHaveBeenCalledWith(ACCOUNT);
    expect(mockClient.getDelegatee).toHaveBeenCalledWith(ACCOUNT);
  });

  it("reports loading while the first lookup is still in flight", async () => {
    mockClient.getBaseVotes.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useGovernanceBalance(ACCOUNT));

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.votingPower).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("surfaces an Error message and clears partial results when a lookup fails", async () => {
    mockClient.getVotes.mockRejectedValueOnce(new Error("rpc unavailable"));

    const { result } = renderHook(() => useGovernanceBalance(ACCOUNT));

    await waitFor(() => expect(result.current.error).toBe("rpc unavailable"));
    expect(result.current.baseVotes).toBeNull();
    expect(result.current.votingPower).toBeNull();
    expect(result.current.delegatee).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("stringifies non-Error rejections", async () => {
    mockClient.getDelegatee.mockRejectedValueOnce("boom");

    const { result } = renderHook(() => useGovernanceBalance(ACCOUNT));

    await waitFor(() => expect(result.current.error).toBe("boom"));
  });

  it("reports not-configured without constructing the client or calling the contract", async () => {
    delete process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;

    const { result } = renderHook(() => useGovernanceBalance(ACCOUNT));

    expect(result.current.loading).toBe(false);
    expect(result.current.baseVotes).toBeNull();
    expect(result.current.votingPower).toBeNull();
    expect(result.current.error).toBeNull();
    expect(VotesClient).not.toHaveBeenCalled();
    expect(mockClient.getBaseVotes).not.toHaveBeenCalled();
  });

  it("stays empty and idle when no address is connected", async () => {
    const { result } = renderHook(() => useGovernanceBalance(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.baseVotes).toBeNull();
    expect(result.current.votingPower).toBeNull();
    expect(result.current.delegatee).toBeNull();
    expect(mockClient.getBaseVotes).not.toHaveBeenCalled();
  });

  it("clears previous results when the address is removed", async () => {
    const { result, rerender } = renderHook(
      ({ address }: { address: string | null }) => useGovernanceBalance(address),
      { initialProps: { address: ACCOUNT as string | null } },
    );

    await waitFor(() => expect(result.current.votingPower).toBe(250n));

    rerender({ address: null });

    await waitFor(() => expect(result.current.votingPower).toBeNull());
    expect(result.current.baseVotes).toBeNull();
    expect(result.current.delegatee).toBeNull();
  });

  it("re-queries the chain when refresh is called", async () => {
    const { result } = renderHook(() => useGovernanceBalance(ACCOUNT));

    await waitFor(() => expect(result.current.votingPower).toBe(250n));
    expect(mockClient.getBaseVotes).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(mockClient.getBaseVotes).toHaveBeenCalledTimes(2));
  });
});

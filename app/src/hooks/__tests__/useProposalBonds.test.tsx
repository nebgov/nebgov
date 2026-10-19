/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ProposalBond } from "@nebgov/sdk";
import { useBondEligibility, useBondsByProposer, useProposalBond } from "../useProposalBonds";

const mockClient = {
  getBond: jest.fn(),
  getBondsByProposer: jest.fn(),
  getSettings: jest.fn(),
};

jest.mock("@nebgov/sdk", () => ({
  ProposalBondsClient: jest.fn().mockImplementation(() => mockClient),
}));

const bond: ProposalBond = {
  proposer: "GPROPOSER",
  descriptionHash: "hash-1",
  amount: 100n,
  lockedLedger: 10,
  state: "Locked",
};

describe("proposal-bond hooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_PROPOSAL_BONDS_ADDRESS = "CPROPOSALBONDS";
    process.env.NEXT_PUBLIC_INDEXER_URL = "https://indexer.example.test";
  });

  it("starts loading, resolves a bond, and refetches on demand", async () => {
    mockClient.getBond.mockResolvedValueOnce(bond).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useProposalBond("hash-1"));
    expect(result.current).toEqual({
      bond: null,
      loading: true,
      error: null,
      refetch: expect.any(Function),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bond).toEqual(bond);
    expect(result.current.error).toBeNull();

    act(() => result.current.refetch());
    await waitFor(() => expect(mockClient.getBond).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bond).toBeNull();
  });

  it("exposes fetch errors and reloads when the description hash changes", async () => {
    mockClient.getBond.mockRejectedValueOnce(new Error("indexer unavailable")).mockResolvedValueOnce(bond);

    const { result, rerender } = renderHook(
      ({ hash }: { hash: string }) => useProposalBond(hash),
      { initialProps: { hash: "hash-1" } },
    );

    await waitFor(() => expect(result.current.error).toBe("indexer unavailable"));
    rerender({ hash: "hash-2" });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockClient.getBond).toHaveBeenNthCalledWith(2, "hash-2");
    expect(result.current.bond).toEqual(bond);
    expect(result.current.error).toBeNull();
  });

  it("fetches a proposer's bonds and refetches when the address changes", async () => {
    mockClient.getBondsByProposer.mockResolvedValue([bond]);
    const { result, rerender } = renderHook(
      ({ address }: { address: string }) => useBondsByProposer(address),
      { initialProps: { address: "GPROPOSER" } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bonds).toEqual([bond]);

    rerender({ address: "GANOTHER" });
    await waitFor(() => expect(mockClient.getBondsByProposer).toHaveBeenCalledTimes(2));
    expect(mockClient.getBondsByProposer).toHaveBeenNthCalledWith(2, "GANOTHER");
  });

  it("does not query bonds when there are no locked bonds", () => {
    const { result } = renderHook(() => useBondEligibility([], 100));

    expect(result.current.eligibility).toEqual({});
    expect(mockClient.getSettings).not.toHaveBeenCalled();
  });
});

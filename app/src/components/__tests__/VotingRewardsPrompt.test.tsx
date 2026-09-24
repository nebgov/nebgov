import React from "react";
import { render, screen } from "@testing-library/react";
import { VotingRewardsPrompt } from "../VotingRewardsPrompt";
import type { ClaimableRewardRow } from "../../hooks/useVotingRewards";

const mockUseClaimableRewards = jest.fn();

jest.mock("../../hooks/useVotingRewards", () => ({
  useClaimableRewards: (...args: unknown[]) => mockUseClaimableRewards(...args),
}));

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD";

function claim(overrides: Partial<ClaimableRewardRow> = {}): ClaimableRewardRow {
  return {
    epochId: 1n,
    amount: 1000n,
    merkleProof: ["0x1"],
    claimed: false,
    ...overrides,
  };
}

describe("VotingRewardsPrompt", () => {
  beforeEach(() => {
    mockUseClaimableRewards.mockReset();
  });

  it("renders nothing when no wallet is connected", () => {
    mockUseClaimableRewards.mockReturnValue({
      totalUnclaimed: 0n,
      unclaimed: [],
      loading: false,
      error: null,
    });
    const { container } = render(<VotingRewardsPrompt address={null} />);
    expect(container.firstChild).toBeNull();
    expect(mockUseClaimableRewards).toHaveBeenCalledWith(null);
  });

  it("renders nothing while loading", () => {
    mockUseClaimableRewards.mockReturnValue({
      totalUnclaimed: 0n,
      unclaimed: [],
      loading: true,
      error: null,
    });
    const { container } = render(<VotingRewardsPrompt address={ADDRESS} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing on error", () => {
    mockUseClaimableRewards.mockReturnValue({
      totalUnclaimed: 0n,
      unclaimed: [],
      loading: false,
      error: "failed",
    });
    const { container } = render(<VotingRewardsPrompt address={ADDRESS} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for empty / all-claimed rewards", () => {
    mockUseClaimableRewards.mockReturnValue({
      totalUnclaimed: 0n,
      unclaimed: [],
      loading: false,
      error: null,
    });
    const { container } = render(<VotingRewardsPrompt address={ADDRESS} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows formatted bigint total for a single unclaimed epoch", () => {
    mockUseClaimableRewards.mockReturnValue({
      totalUnclaimed: 12_345n,
      unclaimed: [claim({ amount: 12_345n, epochId: 4n })],
      loading: false,
      error: null,
    });

    render(<VotingRewardsPrompt address={ADDRESS} />);

    expect(
      screen.getByText("Voting earns rewards — you have 12,345 unclaimed"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Across 1 epoch\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Claim rewards" })).toHaveAttribute(
      "href",
      "/rewards",
    );
  });

  it("pluralizes epochs and sums mixed unclaimed amounts", () => {
    // Simulates what useClaimableRewards derives from mixed claimed/unclaimed rows:
    // only unclaimed contribute to totalUnclaimed.
    mockUseClaimableRewards.mockReturnValue({
      totalUnclaimed: 1_000_500n,
      unclaimed: [
        claim({ epochId: 2n, amount: 1_000_000n, claimed: false }),
        claim({ epochId: 3n, amount: 500n, claimed: false }),
      ],
      loading: false,
      error: null,
    });

    render(<VotingRewardsPrompt address={ADDRESS} />);

    expect(
      screen.getByText("Voting earns rewards — you have 1,000,500 unclaimed"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Across 2 epochs\./)).toBeInTheDocument();
  });
});

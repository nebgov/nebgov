import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { EpochRewardCard } from "../EpochRewardCard";
import type { ClaimableRewardRow, RewardEpochSummary } from "../../hooks/useVotingRewards";

const BASE_EPOCH: RewardEpochSummary = {
  epochId: 7n,
  startLedger: 1_000_000,
  endLedger: 1_100_000,
  merkleRoot: "0xabc",
  totalRewardAmount: 1_250_000n,
  publishedAt: "2026-09-01T00:00:00Z",
};

function makeReward(overrides: Partial<ClaimableRewardRow> = {}): ClaimableRewardRow {
  return {
    epochId: 7n,
    amount: 42_500n,
    merkleProof: ["0xproof"],
    claimed: false,
    ...overrides,
  };
}

describe("EpochRewardCard", () => {
  it("renders empty state when wallet earned nothing", () => {
    render(<EpochRewardCard epoch={BASE_EPOCH} />);

    expect(screen.getByText("Epoch 7")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("No reward")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows awaiting publication without a claim button", () => {
    const unpublished: RewardEpochSummary = {
      ...BASE_EPOCH,
      publishedAt: null,
      merkleRoot: null,
    };
    render(<EpochRewardCard epoch={unpublished} reward={makeReward({ amount: 9_999n })} />);

    expect(screen.getByText("Awaiting publication")).toBeInTheDocument();
    expect(screen.getByText("9,999")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows unclaimed published reward with formatted bigint and claim button", () => {
    const onClaim = jest.fn();
    render(
      <EpochRewardCard
        epoch={BASE_EPOCH}
        reward={makeReward({ amount: 1_234_567n, claimed: false })}
        onClaim={onClaim}
      />,
    );

    expect(screen.getByText("1,234,567")).toBeInTheDocument();
    expect(screen.getByText("Ready to claim")).toBeInTheDocument();
    // pool amount also formats with Intl
    expect(screen.getByText(/pool 1,250,000/)).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /Claim 1,234,567/ });
    fireEvent.click(button);
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it("shows claimed state without a claim button", () => {
    render(
      <EpochRewardCard
        epoch={BASE_EPOCH}
        reward={makeReward({ amount: 88_000n, claimed: true })}
        onClaim={jest.fn()}
      />,
    );

    expect(screen.getByText("88,000")).toBeInTheDocument();
    expect(screen.getByText("Claimed")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("disables claim button while claiming", () => {
    render(
      <EpochRewardCard
        epoch={BASE_EPOCH}
        reward={makeReward({ amount: 500n })}
        onClaim={jest.fn()}
        claiming
      />,
    );

    expect(screen.getByRole("button", { name: /Claiming/ })).toBeDisabled();
  });

  it("formats ledger ranges and large bigint pool amounts", () => {
    const epoch: RewardEpochSummary = {
      ...BASE_EPOCH,
      epochId: 12n,
      startLedger: 2_500_000,
      endLedger: 2_600_000,
      totalRewardAmount: 99_000_000n,
    };
    render(<EpochRewardCard epoch={epoch} reward={makeReward({ amount: 0n })} />);

    expect(screen.getByText("Epoch 12")).toBeInTheDocument();
    expect(screen.getByText(/Ledgers 2,500,000 – 2,600,000/)).toBeInTheDocument();
    expect(screen.getByText(/pool 99,000,000/)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

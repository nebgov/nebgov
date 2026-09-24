import React from "react";
import { render, screen } from "@testing-library/react";
import { RewardsLeaderboard } from "../RewardsLeaderboard";
import type { LeaderboardRow } from "../../hooks/useVotingRewards";

const mockUseEpochLeaderboard = jest.fn();

jest.mock("../../hooks/useVotingRewards", () => ({
  useEpochLeaderboard: (...args: unknown[]) => mockUseEpochLeaderboard(...args),
}));

jest.mock("../ui/Skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

const YOU = "GABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD";
const OTHER = "GOTHERADDRESS0000000000000000000000000000";

function rows(partial: LeaderboardRow[]): LeaderboardRow[] {
  return partial;
}

describe("RewardsLeaderboard", () => {
  beforeEach(() => {
    mockUseEpochLeaderboard.mockReset();
  });

  it("renders empty guidance when no epoch is selected", () => {
    mockUseEpochLeaderboard.mockReturnValue({ rows: [], loading: false, error: null });
    render(<RewardsLeaderboard epochId={null} />);

    expect(screen.getByText("No published epoch to rank yet.")).toBeInTheDocument();
    expect(mockUseEpochLeaderboard).toHaveBeenCalledWith(null, 10);
  });

  it("shows loading skeletons", () => {
    mockUseEpochLeaderboard.mockReturnValue({ rows: [], loading: true, error: null });
    render(<RewardsLeaderboard epochId={3n} />);

    expect(screen.getAllByTestId("skeleton")).toHaveLength(3);
  });

  it("shows error text", () => {
    mockUseEpochLeaderboard.mockReturnValue({
      rows: [],
      loading: false,
      error: "backend unavailable",
    });
    render(<RewardsLeaderboard epochId={3n} />);

    expect(screen.getByText("backend unavailable")).toBeInTheDocument();
  });

  it("shows empty rows message for an epoch with no voters", () => {
    mockUseEpochLeaderboard.mockReturnValue({ rows: [], loading: false, error: null });
    render(<RewardsLeaderboard epochId={9n} />);

    expect(screen.getByText("Nobody voted during epoch 9.")).toBeInTheDocument();
  });

  it("renders mixed claimed/unclaimed rows with bigint formatting and highlight", () => {
    mockUseEpochLeaderboard.mockReturnValue({
      rows: rows([
        { address: YOU, amount: 1_500_000n, claimed: false },
        { address: OTHER, amount: 42_000n, claimed: true },
      ]),
      loading: false,
      error: null,
    });

    render(<RewardsLeaderboard epochId={5n} highlightAddress={YOU} limit={5} />);

    expect(mockUseEpochLeaderboard).toHaveBeenCalledWith(5n, 5);
    expect(screen.getByText("1,500,000")).toBeInTheDocument();
    expect(screen.getByText("42,000")).toBeInTheDocument();
    expect(screen.getByText("Unclaimed")).toBeInTheDocument();
    expect(screen.getByText("Claimed")).toBeInTheDocument();
    expect(screen.getByText("you")).toBeInTheDocument();
    // truncated addresses
    expect(screen.getByText(/GABC\.\.\.ABCD/)).toBeInTheDocument();
    expect(screen.getByText(/GOTH\.\.\.0000/)).toBeInTheDocument();
  });

  it("labels all-unclaimed and all-claimed tables correctly", () => {
    mockUseEpochLeaderboard.mockReturnValue({
      rows: rows([
        { address: YOU, amount: 100n, claimed: false },
        { address: OTHER, amount: 200n, claimed: false },
      ]),
      loading: false,
      error: null,
    });
    const { rerender } = render(<RewardsLeaderboard epochId={1n} />);
    expect(screen.getAllByText("Unclaimed")).toHaveLength(2);

    mockUseEpochLeaderboard.mockReturnValue({
      rows: rows([
        { address: YOU, amount: 100n, claimed: true },
        { address: OTHER, amount: 200n, claimed: true },
      ]),
      loading: false,
      error: null,
    });
    rerender(<RewardsLeaderboard epochId={1n} />);
    expect(screen.getAllByText("Claimed")).toHaveLength(2);
  });
});

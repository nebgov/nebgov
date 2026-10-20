import React from "react";
import renderer from "react-test-renderer";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { RegistryDelegatorInfo } from "@nebgov/sdk";

jest.mock("@nebgov/sdk", () => ({
  VotesClient: jest.fn(),
}));

jest.mock("../../lib/utils", () => ({
  formatVotingPower: (power: bigint) => `${power} votes`,
}));

import { DelegatorList } from "../DelegatorList";
import { VotesClient } from "@nebgov/sdk";

const mockVotesClient = {
  getRegistryDelegators: jest.fn(),
};

(VotesClient as jest.Mock).mockImplementation(() => mockVotesClient);

describe("DelegatorList", () => {
  const mockDelegators: RegistryDelegatorInfo[] = [
    {
      address: "GAAA123",
      delegatedPower: 1000n,
      delegatedAtLedger: 100,
      chainDepth: 1,
    },
    {
      address: "GBBB456",
      delegatedPower: 500n,
      delegatedAtLedger: 101,
      chainDepth: 2,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS = "CGOVERNOR";
    process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS = "CTIMELOCK";
    process.env.NEXT_PUBLIC_VOTES_ADDRESS = "CVOTES";
    process.env.NEXT_PUBLIC_NETWORK = "testnet";
    process.env.NEXT_PUBLIC_INDEXER_URL = "https://indexer.example.test";
  });

  it("renders loading state initially", () => {
    mockVotesClient.getRegistryDelegators.mockImplementation(
      () => new Promise(() => {})
    );

    const tree = renderer
      .create(<DelegatorList delegatee="GDELEGATEE" />)
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("renders empty state when no delegators", async () => {
    mockVotesClient.getRegistryDelegators.mockResolvedValue([]);

    render(<DelegatorList delegatee="GDELEGATEE" />);

    await waitFor(() => {
      expect(screen.getByText("No current delegators.")).toBeInTheDocument();
    });
  });

  it("renders delegators list with voting power", async () => {
    mockVotesClient.getRegistryDelegators.mockResolvedValue(mockDelegators);

    render(<DelegatorList delegatee="GDELEGATEE" pageSize={10} />);

    await waitFor(() => {
      expect(screen.getByText(/GAAA123/)).toBeInTheDocument();
      expect(screen.getByText(/GBBB456/)).toBeInTheDocument();
      expect(screen.getByText("1000 votes")).toBeInTheDocument();
      expect(screen.getByText("500 votes")).toBeInTheDocument();
    });
  });

  it("displays ledger information", async () => {
    mockVotesClient.getRegistryDelegators.mockResolvedValue(mockDelegators);

    render(<DelegatorList delegatee="GDELEGATEE" />);

    await waitFor(() => {
      expect(screen.getByText(/ledger #100/)).toBeInTheDocument();
      expect(screen.getByText(/ledger #101/)).toBeInTheDocument();
    });
  });

  it("displays chain depth when greater than 1", async () => {
    mockVotesClient.getRegistryDelegators.mockResolvedValue(mockDelegators);

    render(<DelegatorList delegatee="GDELEGATEE" />);

    await waitFor(() => {
      expect(screen.getByText(/depth 2/)).toBeInTheDocument();
    });
  });

  it("handles pagination navigation", async () => {
    mockVotesClient.getRegistryDelegators.mockResolvedValue(mockDelegators);

    const { rerender } = render(
      <DelegatorList delegatee="GDELEGATEE" pageSize={2} />
    );

    await waitFor(() => {
      expect(screen.getByText(/Showing 1–2/)).toBeInTheDocument();
    });

    const nextButton = screen.getByText(/Next →/);
    fireEvent.click(nextButton);

    rerender(<DelegatorList delegatee="GDELEGATEE" pageSize={2} />);

    await waitFor(() => {
      expect(mockVotesClient.getRegistryDelegators).toHaveBeenCalledWith(
        "GDELEGATEE",
        2,
        2
      );
    });
  });

  it("disables previous button on first page", async () => {
    mockVotesClient.getRegistryDelegators.mockResolvedValue(mockDelegators);

    render(<DelegatorList delegatee="GDELEGATEE" pageSize={2} />);

    await waitFor(() => {
      const prevButton = screen.getByText(/← Previous/);
      expect(prevButton).toBeDisabled();
    });
  });

  it("disables next button when fewer results than page size", async () => {
    mockVotesClient.getRegistryDelegators.mockResolvedValue(mockDelegators);

    render(<DelegatorList delegatee="GDELEGATEE" pageSize={10} />);

    await waitFor(() => {
      const nextButton = screen.getByText(/Next →/);
      expect(nextButton).toBeDisabled();
    });
  });

  it("renders error state on fetch failure", async () => {
    mockVotesClient.getRegistryDelegators.mockRejectedValue(
      new Error("Network error")
    );

    render(<DelegatorList delegatee="GDELEGATEE" />);

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it("applies custom className", () => {
    mockVotesClient.getRegistryDelegators.mockImplementation(
      () => new Promise(() => {})
    );

    const tree = renderer
      .create(
        <DelegatorList delegatee="GDELEGATEE" className="custom-class" />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });
});

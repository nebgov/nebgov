import { render, screen, waitFor } from "@testing-library/react";
import { VoterHistoryCard } from "../VoterHistoryCard";

const mockUseWallet = jest.fn();
const mockGetVoterHistory = jest.fn();

jest.mock("../../lib/wallet-context", () => ({ useWallet: () => mockUseWallet() }));
jest.mock("@nebgov/sdk", () => ({
  AnalyticsClient: jest.fn().mockImplementation(() => ({ getVoterHistory: mockGetVoterHistory })),
}));

describe("VoterHistoryCard", () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({ isConnected: true, publicKey: "GTEST" });
    mockGetVoterHistory.mockReset();
  });

  it("does not render when a wallet is disconnected", () => {
    mockUseWallet.mockReturnValue({ isConnected: false, publicKey: null });
    const { container } = render(<VoterHistoryCard />);
    expect(container).toBeEmptyDOMElement();
    expect(mockGetVoterHistory).not.toHaveBeenCalled();
  });

  it("renders loading then the returned participation metrics", async () => {
    mockGetVoterHistory.mockResolvedValue({
      voter: "GTEST",
      proposalsVoted: 3,
      proposalsEligible: 4,
      participationRateBps: 7_500,
      totalWeightCast: 900n,
      forCount: 2,
      againstCount: 1,
      abstainCount: 0,
      lastVotedLedger: 42,
    });

    render(<VoterHistoryCard />);
    expect(screen.getByLabelText("Loading content")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("900")).toBeInTheDocument());
    expect(screen.getByText("75.0%")).toBeInTheDocument();
    expect(screen.getByText("2 / 1 / 0")).toBeInTheDocument();
  });

  it("shows the SDK error", async () => {
    mockGetVoterHistory.mockRejectedValue(new Error("RPC unavailable"));
    render(<VoterHistoryCard />);
    await waitFor(() => expect(screen.getByText("RPC unavailable")).toBeInTheDocument());
  });
});


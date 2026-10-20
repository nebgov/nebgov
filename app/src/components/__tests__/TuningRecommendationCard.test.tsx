import { render, screen } from "@testing-library/react";
import type { TuningRecommendation } from "@nebgov/sdk";
import { TuningRecommendationCard } from "../TuningRecommendationCard";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../lib/wallet-context", () => ({
  useWallet: () => ({ isConnected: false, publicKey: null }),
}));
jest.mock("../../lib/nebgov-env", () => ({ readGovernorConfig: () => null }));

function recommendation(overrides: Partial<TuningRecommendation> = {}): TuningRecommendation {
  return {
    id: 1,
    computedAt: "2026-01-01T12:00:00.000Z",
    currentQuorumNumerator: 10,
    recommendedQuorumNumerator: 12,
    currentProposalThreshold: 100n,
    recommendedProposalThreshold: 125n,
    rationale: {
      quorumNumerator: { direction: "up", reason: "Participation is increasing" },
      proposalThreshold: { direction: "down", reason: "Lower barrier recommended" },
      votingPeriod: { direction: "unchanged", reason: "No change" },
    },
    autoProposed: false,
    proposalId: null,
    ...overrides,
  } as TuningRecommendation;
}

describe("TuningRecommendationCard", () => {
  it("renders the recommendation, rationale, and direction badges", () => {
    render(<TuningRecommendationCard recommendation={recommendation()} />);
    expect(screen.getByText("Latest recommendation")).toBeInTheDocument();
    expect(screen.getByText("↑ Up")).toBeInTheDocument();
    expect(screen.getByText("Participation is increasing")).toBeInTheDocument();
    expect(screen.getByText("10 -> 12")).toBeInTheDocument();
  });

  it("disables proposing when the wallet or governor config is unavailable", () => {
    render(<TuningRecommendationCard recommendation={recommendation()} />);
    expect(screen.getByRole("button", { name: "Propose This Change" })).toBeDisabled();
  });

  it("reports when no setting changes are recommended", () => {
    render(
      <TuningRecommendationCard
        recommendation={recommendation({ recommendedQuorumNumerator: 10, recommendedProposalThreshold: 100n })}
      />,
    );
    expect(screen.getByRole("button", { name: "No parameter change to propose" })).toBeDisabled();
  });
});


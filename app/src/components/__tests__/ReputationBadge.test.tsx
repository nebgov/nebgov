import React from "react";
import { render, screen } from "@testing-library/react";
import type { ProposerReputation } from "@nebgov/sdk";
import { ReputationBadge } from "../ReputationBadge";

function makeReputation(overrides: Partial<ProposerReputation> = {}): ProposerReputation {
  return {
    proposer: "GPROPOSER",
    totalProposals: 3,
    totalParticipationBpsSum: 0n,
    lastProposalLedger: 100,
    reputationScore: 0,
    thresholdMultiplierBps: 10000,
    firstProposalLedger: 1,
    consecutiveSuccessful: 0,
    consecutiveFailed: 0,
    ...overrides,
  };
}

describe("ReputationBadge", () => {
  describe("tier selection", () => {
    it.each([
      ["Elite", { reputationScore: 500 }, "🏆 Elite"],
      ["Trusted", { reputationScore: 1 }, "✅ Trusted"],
      ["Caution", { reputationScore: 0 }, "⚠️ Caution"],
      ["Penalized", { reputationScore: -300 }, "🚫 Penalized"],
    ])("renders the %s tier for a proposer with history", (_tier, overrides, text) => {
      render(<ReputationBadge reputation={makeReputation(overrides)} />);

      expect(screen.getByText(text)).toBeInTheDocument();
    });

    it("renders the New tier for a proposer with no proposals, regardless of score", () => {
      render(
        <ReputationBadge reputation={makeReputation({ totalProposals: 0, reputationScore: 900 })} />,
      );

      expect(screen.getByText("⚪ New")).toBeInTheDocument();
      expect(screen.queryByText(/Elite/)).not.toBeInTheDocument();
    });

    it.each([
      [499, "✅ Trusted"],
      [-299, "⚠️ Caution"],
    ])("places score %i in the boundary tier %s", (score, text) => {
      render(<ReputationBadge reputation={makeReputation({ reputationScore: score })} />);

      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  describe("styling", () => {
    it("applies the penalized color classes", () => {
      render(<ReputationBadge reputation={makeReputation({ reputationScore: -500 })} />);

      const badge = screen.getByText("🚫 Penalized");
      expect(badge).toHaveClass("bg-rose-100", "text-rose-800", "border-rose-200");
    });

    it("applies the elite color classes", () => {
      render(<ReputationBadge reputation={makeReputation({ reputationScore: 750 })} />);

      expect(screen.getByText("🏆 Elite")).toHaveClass("bg-purple-100", "text-purple-800");
    });
  });

  describe("tooltip", () => {
    it("summarises score, proposal count and a successful streak", () => {
      render(
        <ReputationBadge
          reputation={makeReputation({
            reputationScore: 120,
            totalProposals: 7,
            consecutiveSuccessful: 4,
          })}
        />,
      );

      expect(screen.getByTitle("Score: 120 | Proposals: 7 | Streak: 4 succeeded in a row")).toBeInTheDocument();
    });

    it("reports a failed streak when there is no successful one", () => {
      render(
        <ReputationBadge
          reputation={makeReputation({
            reputationScore: -40,
            totalProposals: 2,
            consecutiveFailed: 2,
          })}
        />,
      );

      expect(screen.getByTitle("Score: -40 | Proposals: 2 | Streak: 2 failed in a row")).toBeInTheDocument();
    });

    it("reports no streak when neither counter is set", () => {
      render(<ReputationBadge reputation={makeReputation()} />);

      expect(screen.getByTitle("Score: 0 | Proposals: 3 | Streak: no streak")).toBeInTheDocument();
    });
  });
});

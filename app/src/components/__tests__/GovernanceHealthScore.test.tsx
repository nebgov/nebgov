import React from "react";
import { render, screen } from "@testing-library/react";
import type { AllTimeStats } from "@nebgov/sdk";
import { GovernanceHealthScore } from "../GovernanceHealthScore";

function makeStats(overrides: Partial<AllTimeStats> = {}): AllTimeStats {
  return {
    totalProposals: 12n,
    totalVotesCast: 345n,
    uniqueVoters: 67n,
    quorumHitCount: 8n,
    quorumMissCount: 4n,
    passRateBps: 5_000,
    ...overrides,
  };
}

function valueFor(label: string): string | null {
  return screen.getByText(label).nextElementSibling?.textContent ?? null;
}

describe("GovernanceHealthScore", () => {
  describe("missing-data state", () => {
    it("renders a skeleton and no metrics when stats are null", () => {
      render(<GovernanceHealthScore stats={null} />);

      expect(screen.getAllByLabelText("Loading content")).toHaveLength(2);
      expect(screen.queryByText("Governance activity")).not.toBeInTheDocument();
      expect(screen.queryByText("total proposals")).not.toBeInTheDocument();
      expect(screen.queryByText("Total votes cast")).not.toBeInTheDocument();
      expect(screen.queryByText("Unique voters")).not.toBeInTheDocument();
    });

    it("renders the skeleton while loading even if stale stats are present", () => {
      render(<GovernanceHealthScore stats={makeStats()} loading />);

      expect(screen.getAllByLabelText("Loading content")).toHaveLength(2);
      expect(screen.queryByText("Governance activity")).not.toBeInTheDocument();
      expect(screen.queryByText("12")).not.toBeInTheDocument();
    });
  });

  describe("populated state", () => {
    it("renders each indexer-derived count next to its label", () => {
      render(<GovernanceHealthScore stats={makeStats()} loading={false} />);

      expect(screen.queryByLabelText("Loading content")).not.toBeInTheDocument();
      expect(screen.getByText("Governance activity")).toBeInTheDocument();
      expect(screen.getByText("total proposals").previousElementSibling).toHaveTextContent(/^12$/);
      expect(valueFor("Total votes cast")).toBe("345");
      expect(valueFor("Unique voters")).toBe("67");
    });

    it("renders zero counts as 0 rather than falling back to the skeleton", () => {
      render(
        <GovernanceHealthScore
          stats={makeStats({ totalProposals: 0n, totalVotesCast: 0n, uniqueVoters: 0n })}
        />,
      );

      expect(screen.queryByLabelText("Loading content")).not.toBeInTheDocument();
      expect(screen.getByText("total proposals").previousElementSibling).toHaveTextContent(/^0$/);
      expect(valueFor("Total votes cast")).toBe("0");
      expect(valueFor("Unique voters")).toBe("0");
    });

    it("renders bigint counts beyond Number.MAX_SAFE_INTEGER without precision loss", () => {
      // Odd integers above 2^53 are not representable as doubles, so any
      // Number() round-trip would change the rendered digits.
      const huge = BigInt(Number.MAX_SAFE_INTEGER) + 2n; // 9007199254740993
      render(
        <GovernanceHealthScore
          stats={makeStats({
            totalProposals: huge,
            totalVotesCast: huge + 2n,
            uniqueVoters: huge + 4n,
          })}
        />,
      );

      expect(screen.getByText("total proposals").previousElementSibling).toHaveTextContent(
        /^9007199254740993$/,
      );
      expect(valueFor("Total votes cast")).toBe("9007199254740995");
      expect(valueFor("Unique voters")).toBe("9007199254740997");
    });
  });

  // The original composite 0-100 score (green >= 66, yellow >= 33, red below)
  // was removed because its quorum-hit / pass-rate inputs have no on-chain
  // source. Pin that the headline carries no threshold colouring and that
  // those unsourced fields are never surfaced.
  describe("no score bands", () => {
    it.each([
      ["no activity", makeStats({ totalProposals: 0n, totalVotesCast: 0n, uniqueVoters: 0n })],
      ["high activity", makeStats({ totalProposals: 10_000n })],
      ["worst legacy inputs", makeStats({ quorumHitCount: 0n, passRateBps: 0 })],
      ["best legacy inputs", makeStats({ quorumMissCount: 0n, passRateBps: 10_000 })],
    ])("uses neutral headline colouring for %s", (_label, stats) => {
      render(<GovernanceHealthScore stats={stats} />);

      const headline = screen.getByText("total proposals").previousElementSibling as HTMLElement;
      expect(headline).toHaveClass("text-gray-900");
      expect(headline.className).not.toMatch(/text-(green|yellow|red)-/);
    });

    it("does not render the removed score, pass-rate or quorum fields", () => {
      render(<GovernanceHealthScore stats={makeStats()} />);

      expect(screen.queryByText(/health score/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/pass rate/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/quorum/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/participation/i)).not.toBeInTheDocument();
    });
  });
});

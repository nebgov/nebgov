import React from "react";
import { render, screen } from "@testing-library/react";
import type { VoteEscrowLock } from "@nebgov/sdk";
import { LockCard } from "../LockCard";

// 1000 tokens locked for 1000 ledgers (100 -> 1100) at a 2x boost, so the
// contract's power decays linearly from 2000 at ledger 100 to 1000 at 1100:
// power = amount + (initial - amount) * (end - ledger) / (end - start).
function makeLock(overrides: Partial<VoteEscrowLock> = {}): VoteEscrowLock {
  return {
    owner: "GOWNER",
    amount: 1_000n,
    start_ledger: 100,
    end_ledger: 1_100,
    initial_voting_power: 2_000n,
    withdrawn: false,
    ...overrides,
  };
}

function valueFor(label: string): string | null {
  return screen.getByText(label).nextElementSibling?.textContent ?? null;
}

function decayBarWidth(container: HTMLElement): string {
  const bar = container.querySelector<HTMLElement>(".bg-blue-500");
  if (!bar) throw new Error("decay bar not rendered");
  return bar.style.width;
}

describe("LockCard", () => {
  describe("loading state", () => {
    it("renders a skeleton and no lock details", () => {
      const { container } = render(<LockCard lock={null} currentVotingPower={0n} loading />);

      expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
      expect(screen.queryByText("Your Lock")).not.toBeInTheDocument();
      expect(screen.queryByText("No active lock")).not.toBeInTheDocument();
    });

    it("keeps the skeleton while loading even if a lock is already present", () => {
      render(<LockCard lock={makeLock()} currentVotingPower={2_000n} loading />);

      expect(screen.queryByText("Your Lock")).not.toBeInTheDocument();
      expect(screen.queryByText("1000 tokens")).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("renders 'No active lock' when there is no lock", () => {
      const { container } = render(<LockCard lock={null} currentVotingPower={0n} />);

      expect(screen.getByText("No active lock")).toBeInTheDocument();
      expect(screen.queryByText("Your Lock")).not.toBeInTheDocument();
      expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
    });
  });

  describe("populated state", () => {
    it("renders the position at lock creation with no decay yet", () => {
      const { container } = render(<LockCard lock={makeLock()} currentVotingPower={2_000n} />);

      expect(screen.getByText("Your Lock")).toBeInTheDocument();
      expect(valueFor("Locked Amount")).toBe("1000 tokens");
      expect(valueFor("Multiplier")).toBe("2x");
      expect(valueFor("Voting Power")).toBe("2000");
      expect(valueFor("Duration")).toBe("1000 ledgers");
      expect(valueFor("Unlock Ledger")).toBe("1100");
      expect(valueFor("Status")).toBe("Active");
      expect(valueFor("Decay Progress")).toBe("0%");
      expect(decayBarWidth(container)).toBe("0%");
    });

    it("tracks the contract's linear decay part-way through the lock", () => {
      // Ledger 850: 1000 + 1000 * (1100 - 850) / 1000 = 1250, so 750 of the
      // 1000 boost has decayed.
      const { container } = render(<LockCard lock={makeLock()} currentVotingPower={1_250n} />);

      expect(valueFor("Voting Power")).toBe("1250");
      expect(valueFor("Decay Progress")).toBe("75%");
      expect(decayBarWidth(container)).toBe("75%");
    });

    it("rounds partial decay down to a whole percent", () => {
      // 1 of a 300 boost decayed = 0.33%.
      render(
        <LockCard
          lock={makeLock({ initial_voting_power: 1_300n })}
          currentVotingPower={1_299n}
        />,
      );

      expect(valueFor("Decay Progress")).toBe("0%");
    });
  });

  describe("matured lock", () => {
    it("shows the boost fully decayed once power has fallen back to the locked amount", () => {
      // At or past end_ledger the contract returns exactly `amount`.
      const { container } = render(<LockCard lock={makeLock()} currentVotingPower={1_000n} />);

      expect(valueFor("Voting Power")).toBe("1000");
      expect(valueFor("Status")).toBe("Active");
      expect(valueFor("Decay Progress")).toBe("100%");
      expect(decayBarWidth(container)).toBe("100%");
    });
  });

  describe("edge cases", () => {
    it("shows a withdrawn lock with zero power as withdrawn and the decay capped at 100%", () => {
      const { container } = render(
        <LockCard lock={makeLock({ withdrawn: true })} currentVotingPower={0n} />,
      );

      expect(valueFor("Status")).toBe("Withdrawn");
      expect(valueFor("Decay Progress")).toBe("100%");
      expect(decayBarWidth(container)).toBe("100%");
    });

    it("shows 0% decay for a lock with no boost to decay", () => {
      render(
        <LockCard
          lock={makeLock({ initial_voting_power: 1_000n })}
          currentVotingPower={1_000n}
        />,
      );

      expect(valueFor("Multiplier")).toBe("1x");
      expect(valueFor("Decay Progress")).toBe("0%");
    });
  });
});

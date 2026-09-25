/**
 * @jest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import VoteEscrowPage from "../page";

jest.mock("../../../lib/wallet-context", () => ({
  useWallet: () => ({ publicKey: "GTESTVOTEESCROW" }),
}));

const hookState = {
  lock: {
    owner: "GTESTVOTEESCROW",
    amount: 1000n,
    start_ledger: 100,
    end_ledger: 200,
    initial_voting_power: 1500n,
    withdrawn: false,
  },
  votingPower: 1400n,
  stats: {
    total_locked: 1000n,
  },
  loading: false,
  error: null as string | null,
};

jest.mock("../../../hooks/useVoteEscrow", () => ({
  useVoteEscrow: () => hookState,
}));

jest.mock("../../../components/LockCard", () => ({
  LockCard: () => <div data-testid="lock-card" />,
}));

describe("VoteEscrowPage", () => {
  it("renders corrected decay copy and removes inverted wording", () => {
    render(<VoteEscrowPage />);

    fireEvent.change(screen.getByPlaceholderText("Enter amount to lock"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter lock duration in ledgers"), {
      target: { value: "500" },
    });

    const corrected = screen.getByText(/Your voting boost decays linearly during the lock/i);
    expect(corrected).toBeTruthy();
    expect(screen.queryByText(/After unlock, your voting power will decay linearly over the lock period/i)).toBeNull();
  });

  it("shows initial and maturity voting power preview from lock formula", () => {
    render(<VoteEscrowPage />);

    fireEvent.change(screen.getByPlaceholderText("Enter amount to lock"), {
      target: { value: "250" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter lock duration in ledgers"), {
      target: { value: "600" },
    });

    expect(screen.getByText(/Initial voting power:/i).textContent).toContain("1500");
    expect(screen.getByText(/Voting power at maturity:/i).textContent).toContain("1000");
  });
});

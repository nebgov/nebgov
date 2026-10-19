import React from "react";
import { act, render, screen } from "@testing-library/react";
import { CountdownTimer } from "../CountdownTimer";
import { useLedgerClock } from "../../lib/hooks/useLedgerClock";

jest.mock("../../lib/hooks/useLedgerClock", () => ({
  useLedgerClock: jest.fn(),
}));

const mockUseLedgerClock = useLedgerClock as jest.Mock;

// Ledgers close every 5.5s, so 720 ledgers is 66 minutes.
const ONE_HOUR_SIX_MINUTES_AWAY = 720;

function setLedgerClock(currentLedger: number, isLoading = false) {
  mockUseLedgerClock.mockReturnValue({ currentLedger, isLoading, error: null });
}

describe("CountdownTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("rendering a countdown", () => {
    it("shows the label override and the time remaining to the target ledger", () => {
      setLedgerClock(1000);

      render(<CountdownTimer label="Auction ends in" targetLedger={1000 + ONE_HOUR_SIX_MINUTES_AWAY} />);

      expect(screen.getByText("Auction ends in")).toBeInTheDocument();
      expect(screen.getByText("1h 6m")).toBeInTheDocument();
      expect(screen.getByText("(estimated)")).toBeInTheDocument();
    });

    it("exposes the target ledger in the title attribute", () => {
      setLedgerClock(1000);

      render(<CountdownTimer label="Auction ends in" targetLedger={1720} />);

      expect(screen.getByTitle("Target ledger: 1720")).toBeInTheDocument();
    });

    it("shows the voting-ends label for an active proposal", () => {
      setLedgerClock(1000);

      render(
        <CountdownTimer state="Active" startLedger={900} endLedger={1720} />,
      );

      expect(screen.getByText("Voting ends in")).toBeInTheDocument();
      expect(screen.getByText("1h 6m")).toBeInTheDocument();
    });

    it("shows the voting-starts label for a pending proposal", () => {
      setLedgerClock(1000);

      render(<CountdownTimer state="Pending" startLedger={1720} endLedger={2500} />);

      expect(screen.getByText("Voting starts in")).toBeInTheDocument();
    });

    it("shows the veto-window label for a queued proposal", () => {
      setLedgerClock(1000);

      render(
        <CountdownTimer
          state="Queued"
          startLedger={500}
          endLedger={900}
          vetoWindowCloseLedger={1720}
        />,
      );

      expect(screen.getByText("Veto window closes in")).toBeInTheDocument();
    });

    it("shows Now once the target ledger has passed", () => {
      setLedgerClock(1000);

      render(<CountdownTimer label="Auction ends in" targetLedger={900} />);

      expect(screen.getByText("Now")).toBeInTheDocument();
    });
  });

  describe("ticking", () => {
    it("updates the remaining time every second", () => {
      setLedgerClock(1000);

      render(<CountdownTimer label="Auction ends in" targetLedger={1720} />);
      expect(screen.getByText("1h 6m")).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(60_000);
      });

      expect(screen.getByText("1h 5m")).toBeInTheDocument();
    });
  });

  describe("empty states", () => {
    it("renders nothing while the ledger clock is loading", () => {
      setLedgerClock(1000, true);

      const { container } = render(<CountdownTimer label="Auction ends in" targetLedger={1720} />);

      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing before the current ledger is known", () => {
      setLedgerClock(0);

      const { container } = render(<CountdownTimer label="Auction ends in" targetLedger={1720} />);

      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing for a proposal state with no countdown", () => {
      setLedgerClock(1000);

      const { container } = render(
        <CountdownTimer state="Executed" startLedger={100} endLedger={900} />,
      );

      expect(container).toBeEmptyDOMElement();
    });
  });
});

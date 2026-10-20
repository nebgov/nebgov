import React from "react";
import { render, screen } from "@testing-library/react";
import { ChallengeCountdown } from "../ChallengeCountdown";
import { CountdownTimer } from "../CountdownTimer";

jest.mock("../CountdownTimer", () => ({
  CountdownTimer: jest.fn(() => <div data-testid="countdown-timer">Countdown</div>),
}));

const mockCountdownTimer = CountdownTimer as jest.Mock;

describe("ChallengeCountdown", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("active challenge window", () => {
    it("renders CountdownTimer when isElapsed is false", () => {
      render(<ChallengeCountdown challengeEndLedger={1000} isElapsed={false} />);
      expect(screen.getByTestId("countdown-timer")).toBeInTheDocument();
    });

    it("passes correct props to CountdownTimer", () => {
      render(<ChallengeCountdown challengeEndLedger={5000} isElapsed={false} />);
      expect(mockCountdownTimer).toHaveBeenCalledWith(
        {
          label: "Challenge window closes in",
          targetLedger: 5000,
        },
        expect.anything()
      );
    });

    it("updates CountdownTimer when challengeEndLedger changes", () => {
      const { rerender } = render(
        <ChallengeCountdown challengeEndLedger={1000} isElapsed={false} />
      );
      expect(mockCountdownTimer).toHaveBeenCalledWith(
        expect.objectContaining({ targetLedger: 1000 }),
        expect.anything()
      );

      rerender(<ChallengeCountdown challengeEndLedger={2000} isElapsed={false} />);
      expect(mockCountdownTimer).toHaveBeenCalledWith(
        expect.objectContaining({ targetLedger: 2000 }),
        expect.anything()
      );
    });
  });

  describe("expired challenge window", () => {
    it("renders closed message when isElapsed is true", () => {
      render(<ChallengeCountdown challengeEndLedger={1000} isElapsed={true} />);
      expect(screen.getByText("Challenge window closed")).toBeInTheDocument();
    });

    it("does not render CountdownTimer when isElapsed is true", () => {
      render(<ChallengeCountdown challengeEndLedger={1000} isElapsed={true} />);
      expect(screen.queryByTestId("countdown-timer")).not.toBeInTheDocument();
    });

    it("applies correct styling to closed message", () => {
      const { container } = render(
        <ChallengeCountdown challengeEndLedger={1000} isElapsed={true} />
      );
      const span = screen.getByText("Challenge window closed");
      expect(span).toHaveClass("text-sm");
      expect(span).toHaveClass("text-slate-500");
    });
  });

  describe("state transitions", () => {
    it("switches from active to elapsed", () => {
      const { rerender } = render(
        <ChallengeCountdown challengeEndLedger={1000} isElapsed={false} />
      );
      expect(screen.getByTestId("countdown-timer")).toBeInTheDocument();

      rerender(<ChallengeCountdown challengeEndLedger={1000} isElapsed={true} />);
      expect(screen.queryByTestId("countdown-timer")).not.toBeInTheDocument();
      expect(screen.getByText("Challenge window closed")).toBeInTheDocument();
    });

    it("switches from elapsed to active", () => {
      const { rerender } = render(
        <ChallengeCountdown challengeEndLedger={1000} isElapsed={true} />
      );
      expect(screen.getByText("Challenge window closed")).toBeInTheDocument();

      rerender(<ChallengeCountdown challengeEndLedger={1000} isElapsed={false} />);
      expect(screen.queryByText("Challenge window closed")).not.toBeInTheDocument();
      expect(screen.getByTestId("countdown-timer")).toBeInTheDocument();
    });
  });

  describe("default values", () => {
    it("uses false as default for isElapsed when not provided", () => {
      render(<ChallengeCountdown challengeEndLedger={1000} />);
      expect(screen.getByTestId("countdown-timer")).toBeInTheDocument();
    });
  });
});

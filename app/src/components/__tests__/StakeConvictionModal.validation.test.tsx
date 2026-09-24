/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StakeConvictionModal } from "../StakeConvictionModal";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const defaultProps = {
  open: true,
  proposalId: "1",
  onClose: jest.fn(),
  onStake: jest.fn().mockResolvedValue(undefined),
  onWithdraw: jest.fn().mockResolvedValue(undefined),
};

describe("StakeConvictionModal — validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("amount validation", () => {
    it("disables Stake when the amount is empty", () => {
      render(<StakeConvictionModal {...defaultProps} />);
      expect(screen.getByRole("button", { name: /stake/i })).toBeDisabled();
    });

    it("disables Stake for non-integer input", async () => {
      render(<StakeConvictionModal {...defaultProps} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "1.5");
      expect(screen.getByRole("button", { name: /stake/i })).toBeDisabled();
    });

    it("disables Stake for non-numeric input", async () => {
      render(<StakeConvictionModal {...defaultProps} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "abc");
      expect(screen.getByRole("button", { name: /stake/i })).toBeDisabled();
    });

    it("disables Stake for a zero amount", async () => {
      render(<StakeConvictionModal {...defaultProps} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "0");
      expect(screen.getByRole("button", { name: /stake/i })).toBeDisabled();
    });

    it("enables Stake for a valid positive integer amount", async () => {
      render(<StakeConvictionModal {...defaultProps} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "100");
      expect(screen.getByRole("button", { name: /stake/i })).not.toBeDisabled();
    });

    it("calls onStake with the entered amount as a bigint", async () => {
      const onStake = jest.fn().mockResolvedValue(undefined);
      render(<StakeConvictionModal {...defaultProps} onStake={onStake} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "250");
      await userEvent.click(screen.getByRole("button", { name: /stake/i }));
      await waitFor(() => expect(onStake).toHaveBeenCalledWith(250n));
    });

    it("prefills the amount from currentStake when opened", () => {
      render(<StakeConvictionModal {...defaultProps} currentStake={500n} />);
      const input = screen.getByLabelText(/voting power/i) as HTMLInputElement;
      expect(input.value).toBe("500");
    });
  });

  describe("insufficient voting power", () => {
    it("surfaces the contract's rejection as an error message", async () => {
      const onStake = jest.fn().mockRejectedValue(new Error("insufficient voting power"));
      render(<StakeConvictionModal {...defaultProps} onStake={onStake} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "999999999");
      await userEvent.click(screen.getByRole("button", { name: /stake/i }));
      await waitFor(() => {
        expect(screen.getByText("insufficient voting power")).toBeInTheDocument();
      });
    });

    it("does not close the modal when staking fails", async () => {
      const onClose = jest.fn();
      const onStake = jest.fn().mockRejectedValue(new Error("insufficient voting power"));
      render(<StakeConvictionModal {...defaultProps} onClose={onClose} onStake={onStake} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "10");
      await userEvent.click(screen.getByRole("button", { name: /stake/i }));
      await waitFor(() => expect(screen.getByText("insufficient voting power")).toBeInTheDocument());
      expect(onClose).not.toHaveBeenCalled();
    });

    it("falls back to a generic message for a non-Error rejection", async () => {
      const onStake = jest.fn().mockRejectedValue("boom");
      render(<StakeConvictionModal {...defaultProps} onStake={onStake} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "10");
      await userEvent.click(screen.getByRole("button", { name: /stake/i }));
      await waitFor(() => {
        expect(screen.getByText("Transaction failed")).toBeInTheDocument();
      });
    });
  });

  describe("busy/disabled state on submit", () => {
    it("disables Stake and Cancel while a stake is in flight", async () => {
      const { promise, resolve } = deferred<void>();
      const onStake = jest.fn().mockReturnValue(promise);
      render(<StakeConvictionModal {...defaultProps} onStake={onStake} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "100");
      await userEvent.click(screen.getByRole("button", { name: /stake/i }));

      await waitFor(() => expect(screen.getByRole("button", { name: /stake/i })).toBeDisabled());

      resolve();
      await waitFor(() => expect(defaultProps.onClose).not.toHaveBeenCalled()); // guard against unhandled rejection warnings
    });

    it("does not fire a second onStake call from a rapid double-click", async () => {
      const { promise, resolve } = deferred<void>();
      const onStake = jest.fn().mockReturnValue(promise);
      render(<StakeConvictionModal {...defaultProps} onStake={onStake} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "100");
      const btn = screen.getByRole("button", { name: /stake/i });
      await userEvent.click(btn);
      // The button is disabled once submitting starts, so a second click is a no-op.
      fireEvent.click(btn);
      resolve();
      await waitFor(() => expect(onStake).toHaveBeenCalledTimes(1));
    });

    it("disables Withdraw while a withdrawal is in flight", async () => {
      const { promise, resolve } = deferred<void>();
      const onWithdraw = jest.fn().mockReturnValue(promise);
      render(
        <StakeConvictionModal {...defaultProps} currentStake={500n} onWithdraw={onWithdraw} />,
      );
      const withdrawBtn = screen.getByRole("button", { name: /withdraw/i });
      await userEvent.click(withdrawBtn);
      await waitFor(() => expect(withdrawBtn).toBeDisabled());
      resolve();
    });

    it("re-enables the form after a failed submit", async () => {
      const onStake = jest.fn().mockRejectedValue(new Error("failed"));
      render(<StakeConvictionModal {...defaultProps} onStake={onStake} />);
      const input = screen.getByLabelText(/voting power/i);
      await userEvent.type(input, "100");
      await userEvent.click(screen.getByRole("button", { name: /stake/i }));
      await waitFor(() => expect(screen.getByText("failed")).toBeInTheDocument());
      expect(screen.getByRole("button", { name: /stake/i })).not.toBeDisabled();
    });
  });

  describe("dialog semantics", () => {
    it("exposes role=dialog and aria-modal=true", () => {
      render(<StakeConvictionModal {...defaultProps} />);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("labels the dialog via aria-labelledby pointing at the heading", () => {
      render(<StakeConvictionModal {...defaultProps} />);
      const dialog = screen.getByRole("dialog");
      const labelledBy = dialog.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy!)).toHaveTextContent(/support proposal #1/i);
    });

    it("does not render a dialog at all when closed", () => {
      render(<StakeConvictionModal {...defaultProps} open={false} />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("moves focus into the dialog when opened", async () => {
      render(<StakeConvictionModal {...defaultProps} />);
      await waitFor(() => {
        expect(document.activeElement).not.toBe(document.body);
        expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
      });
    });

    it("traps Tab focus within the dialog", async () => {
      render(<StakeConvictionModal {...defaultProps} currentStake={500n} />);
      const dialog = screen.getByRole("dialog");
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const last = focusable[focusable.length - 1];
      last.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      await waitFor(() => expect(document.activeElement).toBe(focusable[0]));
    });

    it("closes on Escape", async () => {
      const onClose = jest.fn();
      render(<StakeConvictionModal {...defaultProps} onClose={onClose} />);
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
  });
});

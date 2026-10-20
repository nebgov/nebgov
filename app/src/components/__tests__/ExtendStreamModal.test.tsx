/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExtendStreamModal } from "../ExtendStreamModal";
import type { TreasuryClient, TreasuryBudgetStream } from "../lib/treasury-client";

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../hooks/useFocusTrap", () => ({
  useFocusTrap: () => ({ current: null }),
}));

import toast from "react-hot-toast";

const mockStream: TreasuryBudgetStream = {
  id: "1",
  name: "Monthly Fund",
  endLedger: 1000000,
} as any;

const mockClient: TreasuryClient = {
  extendStream: jest.fn().mockResolvedValue(undefined),
} as any;

describe("ExtendStreamModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (toast.success as jest.Mock).mockClear();
    (toast.error as jest.Mock).mockClear();
  });

  it("renders the modal with stream information", () => {
    render(
      <ExtendStreamModal
        client={mockClient}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={jest.fn()}
        busy={false}
        setBusy={jest.fn()}
        onClose={jest.fn()}
        onExtended={jest.fn()}
      />
    );

    expect(screen.getByText("Extend Stream")).toBeInTheDocument();
    expect(screen.getByText(/Monthly Fund/)).toBeInTheDocument();
    expect(screen.getByText(/1000000/)).toBeInTheDocument();
  });

  it("has correct dialog attributes for accessibility", () => {
    render(
      <ExtendStreamModal
        client={mockClient}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={jest.fn()}
        busy={false}
        setBusy={jest.fn()}
        onClose={jest.fn()}
        onExtended={jest.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "extend-stream-modal-title");
  });

  it("displays close button", () => {
    const onClose = jest.fn();
    render(
      <ExtendStreamModal
        client={mockClient}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={jest.fn()}
        busy={false}
        setBusy={jest.fn()}
        onClose={onClose}
        onExtended={jest.fn()}
      />
    );

    const closeButton = screen.getByRole("button", { name: /close/i });
    expect(closeButton).toBeInTheDocument();
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("initializes input with default value", () => {
    render(
      <ExtendStreamModal
        client={mockClient}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={jest.fn()}
        busy={false}
        setBusy={jest.fn()}
        onClose={jest.fn()}
        onExtended={jest.fn()}
      />
    );

    const input = screen.getByDisplayValue("1050000");
    expect(input).toBeInTheDocument();
  });

  it("allows input change", () => {
    render(
      <ExtendStreamModal
        client={mockClient}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={jest.fn()}
        busy={false}
        setBusy={jest.fn()}
        onClose={jest.fn()}
        onExtended={jest.fn()}
      />
    );

    const input = screen.getByDisplayValue("1050000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000000" } });
    expect(input.value).toBe("2000000");
  });

  it("validates that new end ledger must be greater than current", () => {
    render(
      <ExtendStreamModal
        client={mockClient}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={jest.fn()}
        busy={false}
        setBusy={jest.fn()}
        onClose={jest.fn()}
        onExtended={jest.fn()}
      />
    );

    const input = screen.getByDisplayValue("1050000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "999999" } });

    const form = screen.getByRole("form") || input.closest("form");
    if (form) {
      fireEvent.submit(form);
      expect(screen.getByText(/must be greater than the current end ledger/)).toBeInTheDocument();
    }
  });

  it("rejects empty input", () => {
    render(
      <ExtendStreamModal
        client={mockClient}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={jest.fn()}
        busy={false}
        setBusy={jest.fn()}
        onClose={jest.fn()}
        onExtended={jest.fn()}
      />
    );

    const input = screen.getByDisplayValue("1050000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });

    const form = screen.getByRole("form") || input.closest("form");
    if (form) {
      fireEvent.submit(form);
      expect(screen.getByText(/Enter a valid whole ledger number/)).toBeInTheDocument();
    }
  });

  it("rejects non-integer input", () => {
    render(
      <ExtendStreamModal
        client={mockClient}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={jest.fn()}
        busy={false}
        setBusy={jest.fn()}
        onClose={jest.fn()}
        onExtended={jest.fn()}
      />
    );

    const input = screen.getByDisplayValue("1050000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1234567.89" } });

    const form = screen.getByRole("form") || input.closest("form");
    if (form) {
      fireEvent.submit(form);
      expect(screen.getByText(/Enter a valid whole ledger number/)).toBeInTheDocument();
    }
  });

  it("calls client.extendStream on valid submission", async () => {
    const signUnsignedXdr = jest.fn().mockResolvedValue("signed-xdr");
    const extendStream = jest.fn().mockResolvedValue(undefined);
    const mockClientWithExtend = { ...mockClient, extendStream };

    render(
      <ExtendStreamModal
        client={mockClientWithExtend}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={signUnsignedXdr}
        busy={false}
        setBusy={jest.fn()}
        onClose={jest.fn()}
        onExtended={jest.fn()}
      />
    );

    const input = screen.getByDisplayValue("1050000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000000" } });

    const form = screen.getByRole("form") || input.closest("form");
    if (form) {
      fireEvent.submit(form);

      await waitFor(() => {
        expect(extendStream).toHaveBeenCalledWith("GXYZ123", 1, 2000000, signUnsignedXdr);
      });
    }
  });

  it("shows success toast on successful extension", async () => {
    const onExtended = jest.fn();
    const onClose = jest.fn();
    const signUnsignedXdr = jest.fn().mockResolvedValue("signed-xdr");
    const extendStream = jest.fn().mockResolvedValue(undefined);
    const mockClientWithExtend = { ...mockClient, extendStream };

    render(
      <ExtendStreamModal
        client={mockClientWithExtend}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={signUnsignedXdr}
        busy={false}
        setBusy={jest.fn()}
        onClose={onClose}
        onExtended={onExtended}
      />
    );

    const input = screen.getByDisplayValue("1050000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000000" } });

    const form = screen.getByRole("form") || input.closest("form");
    if (form) {
      fireEvent.submit(form);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Stream extended");
      });
    }
  });

  it("calls onExtended and onClose callbacks after success", async () => {
    const onExtended = jest.fn();
    const onClose = jest.fn();
    const signUnsignedXdr = jest.fn().mockResolvedValue("signed-xdr");
    const extendStream = jest.fn().mockResolvedValue(undefined);
    const mockClientWithExtend = { ...mockClient, extendStream };

    render(
      <ExtendStreamModal
        client={mockClientWithExtend}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={signUnsignedXdr}
        busy={false}
        setBusy={jest.fn()}
        onClose={onClose}
        onExtended={onExtended}
      />
    );

    const input = screen.getByDisplayValue("1050000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000000" } });

    const form = screen.getByRole("form") || input.closest("form");
    if (form) {
      fireEvent.submit(form);

      await waitFor(() => {
        expect(onExtended).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    }
  });

  it("shows error toast on extension failure", async () => {
    const signUnsignedXdr = jest.fn().mockResolvedValue("signed-xdr");
    const extendStream = jest.fn().mockRejectedValue(new Error("Network error"));
    const mockClientWithExtend = { ...mockClient, extendStream };

    render(
      <ExtendStreamModal
        client={mockClientWithExtend}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={signUnsignedXdr}
        busy={false}
        setBusy={jest.fn()}
        onClose={jest.fn()}
        onExtended={jest.fn()}
      />
    );

    const input = screen.getByDisplayValue("1050000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000000" } });

    const form = screen.getByRole("form") || input.closest("form");
    if (form) {
      fireEvent.submit(form);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    }
  });

  it("clears error message when input changes", () => {
    render(
      <ExtendStreamModal
        client={mockClient}
        stream={mockStream}
        signerPublicKey="GXYZ123"
        signUnsignedXdr={jest.fn()}
        busy={false}
        setBusy={jest.fn()}
        onClose={jest.fn()}
        onExtended={jest.fn()}
      />
    );

    const input = screen.getByDisplayValue("1050000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "999999" } });

    const form = screen.getByRole("form") || input.closest("form");
    if (form) {
      fireEvent.submit(form);
      expect(screen.getByText(/must be greater than the current end ledger/)).toBeInTheDocument();

      fireEvent.change(input, { target: { value: "2000000" } });
      expect(screen.queryByText(/must be greater than the current end ledger/)).not.toBeInTheDocument();
    }
  });
});

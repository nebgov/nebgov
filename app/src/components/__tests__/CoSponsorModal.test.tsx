import React from "react";
import renderer from "react-test-renderer";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";

jest.mock("react-hot-toast");

jest.mock("@nebgov/sdk", () => ({
  CoSponsorshipClient: jest.fn(),
}));

jest.mock("../../lib/wallet-context", () => ({
  useWallet: jest.fn(),
}));

jest.mock("../../lib/nebgov-env", () => ({
  readGovernorConfig: jest.fn(),
}));

import { CoSponsorModal } from "../CoSponsorModal";
import { useWallet } from "../../lib/wallet-context";
import { readGovernorConfig } from "../../lib/nebgov-env";
import { CoSponsorshipClient } from "@nebgov/sdk";

const mockCoSponsorshipClient = {
  coSponsorWithSign: jest.fn(),
};

(CoSponsorshipClient as jest.Mock).mockImplementation(
  () => mockCoSponsorshipClient
);

describe("CoSponsorModal", () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();
  const mockSignTransaction = jest.fn();
  const draftId = 123n;

  beforeEach(() => {
    jest.clearAllMocks();
    (useWallet as jest.Mock).mockReturnValue({
      isConnected: true,
      publicKey: "GPUBKEY123",
      signTransaction: mockSignTransaction,
      connect: jest.fn(),
    });
    (readGovernorConfig as jest.Mock).mockReturnValue({
      governorAddress: "CGOVERNOR",
      coSponsorshipAddress: "CCOSPONSOR",
    });
  });

  it("matches snapshot", () => {
    const tree = renderer
      .create(
        <CoSponsorModal
          draftId={draftId}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("displays draft ID in title", () => {
    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText(/Co-Sponsor Draft #123/)).toBeInTheDocument();
  });

  it("displays modal content", () => {
    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(
      screen.getByText(
        /Pledge your current voting power toward this draft/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/accumulated co-sponsor power meets/i)
    ).toBeInTheDocument();
  });

  it("calls onClose when cancel button clicked", () => {
    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const cancelButton = screen.getByText("Cancel");
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("calls onClose when close button clicked", () => {
    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const closeButton = screen.getByLabelText("Close");
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("successfully co-sponsors draft when wallet connected", async () => {
    mockCoSponsorshipClient.coSponsorWithSign.mockResolvedValue(
      "txhash123456789"
    );

    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const coSponsorButton = screen.getByText("Co-Sponsor");
    fireEvent.click(coSponsorButton);

    await waitFor(() => {
      expect(mockCoSponsorshipClient.coSponsorWithSign).toHaveBeenCalledWith(
        "GPUBKEY123",
        draftId,
        mockSignTransaction
      );
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it("shows explorer link in success toast", async () => {
    mockCoSponsorshipClient.coSponsorWithSign.mockResolvedValue(
      "txhash123456789"
    );
    process.env.NEXT_PUBLIC_NETWORK = "testnet";

    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const coSponsorButton = screen.getByText("Co-Sponsor");
    fireEvent.click(coSponsorButton);

    await waitFor(() => {
      const toastCall = (toast.success as jest.Mock).mock.calls[0][0];
      expect(toastCall).toContain("explorer");
    });
  });

  it("handles missing wallet connection by prompting connect", async () => {
    const mockConnect = jest.fn().mockResolvedValue("GPUBKEY456");
    (useWallet as jest.Mock).mockReturnValue({
      isConnected: false,
      publicKey: null,
      signTransaction: mockSignTransaction,
      connect: mockConnect,
    });

    mockCoSponsorshipClient.coSponsorWithSign.mockResolvedValue(
      "txhash123456789"
    );

    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const coSponsorButton = screen.getByText("Co-Sponsor");
    fireEvent.click(coSponsorButton);

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalled();
    });
  });

  it("shows error when wallet connection fails", async () => {
    const mockConnect = jest.fn().mockRejectedValue(new Error("Connection failed"));
    (useWallet as jest.Mock).mockReturnValue({
      isConnected: false,
      publicKey: null,
      signTransaction: mockSignTransaction,
      connect: mockConnect,
    });

    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const coSponsorButton = screen.getByText("Co-Sponsor");
    fireEvent.click(coSponsorButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("connect your wallet")
      );
    });
  });

  it("shows error when co-sponsorship config missing", async () => {
    (readGovernorConfig as jest.Mock).mockReturnValue({
      governorAddress: "CGOVERNOR",
      coSponsorshipAddress: null,
    });

    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const coSponsorButton = screen.getByText("Co-Sponsor");
    fireEvent.click(coSponsorButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("not configured")
      );
    });
  });

  it("handles co-sponsorship failure", async () => {
    mockCoSponsorshipClient.coSponsorWithSign.mockRejectedValue(
      new Error("Transaction failed")
    );

    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const coSponsorButton = screen.getByText("Co-Sponsor");
    fireEvent.click(coSponsorButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to co-sponsor draft")
      );
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("disables buttons while submitting", async () => {
    mockCoSponsorshipClient.coSponsorWithSign.mockImplementation(
      () => new Promise(() => {})
    );

    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const coSponsorButton = screen.getByText("Co-Sponsor");
    fireEvent.click(coSponsorButton);

    await waitFor(() => {
      expect(coSponsorButton).toBeDisabled();
      expect(screen.getByText("Cancel")).toBeDisabled();
    });
  });

  it("shows submitting state", async () => {
    mockCoSponsorshipClient.coSponsorWithSign.mockImplementation(
      () => new Promise(() => {})
    );

    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const coSponsorButton = screen.getByText("Co-Sponsor");
    fireEvent.click(coSponsorButton);

    await waitFor(() => {
      expect(screen.getByText("Submitting…")).toBeInTheDocument();
    });
  });

  it("has proper ARIA attributes", () => {
    render(
      <CoSponsorModal
        draftId={draftId}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "co-sponsor-modal-title");
  });
});

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import { VotingModal } from "../VotingModal";
import { useWallet } from "../../lib/wallet-context";
import { VoteSupport, VoteType, computeQuadraticWeight } from "@nebgov/sdk";

const mockGovernorClient = {
  estimateVoteGas: jest.fn(),
  castVoteWithSign: jest.fn(),
};

jest.mock("@nebgov/sdk", () => ({
  GovernorClient: jest.fn().mockImplementation(() => mockGovernorClient),
  VoteSupport: { Against: 0, For: 1, Abstain: 2 },
  VoteType: { Simple: "Simple", Extended: "Extended", Quadratic: "Quadratic" },
  computeQuadraticWeight: jest.fn(),
}));

jest.mock("../../lib/wallet-context", () => ({
  useWallet: jest.fn(),
}));

jest.mock("@/hooks/useGovernorConfig", () => ({
  useGovernorConfig: () => ({ divisor: 10_000_000 }),
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const mockUseWallet = useWallet as unknown as jest.Mock;

type WalletState = {
  isConnected: boolean;
  publicKey: string | null;
  connect: jest.Mock;
  signTransaction: jest.Mock;
};

let wallet: WalletState;

function connectedWallet(): WalletState {
  return {
    isConnected: true,
    publicKey: "GWALLET",
    connect: jest.fn(),
    signTransaction: jest.fn(),
  };
}

function renderModal(overrides: Partial<React.ComponentProps<typeof VotingModal>> = {}) {
  const props = {
    open: true,
    onClose: jest.fn(),
    proposalId: "42",
    delegatee: "GDELEGATE",
    votingPower: 4_000_000n,
    onOpenDelegate: jest.fn(),
    onVoted: jest.fn(),
    onSuccess: jest.fn(),
    ...overrides,
  };
  const utils = render(<VotingModal {...props} />);
  return { ...utils, props };
}

describe("VotingModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wallet = connectedWallet();
    mockUseWallet.mockReturnValue(wallet);
    mockGovernorClient.estimateVoteGas.mockResolvedValue({ ok: true, estimatedFeeStroops: "1000" });
    mockGovernorClient.castVoteWithSign.mockResolvedValue(undefined);
    delete process.env.NEXT_PUBLIC_TOTAL_SUPPLY;
  });

  describe("visibility and delegation", () => {
    it("renders nothing while closed", () => {
      const { container } = renderModal({ open: false });
      expect(container).toBeEmptyDOMElement();
    });

    it("shows the delegatee and enables confirmation when delegation is set", () => {
      renderModal();
      expect(screen.getByText("GDELEGATE")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm & Sign" })).toBeEnabled();
    });

    it("blocks confirmation and offers delegation when no delegatee is set", () => {
      wallet = { ...connectedWallet(), publicKey: null };
      mockUseWallet.mockReturnValue(wallet);

      const { props } = renderModal({ delegatee: null });

      expect(screen.getByText("You have not delegated voting power yet.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm & Sign" })).toBeDisabled();
      expect(mockGovernorClient.estimateVoteGas).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Open delegation modal" }));
      expect(props.onOpenDelegate).toHaveBeenCalledTimes(1);
    });

    it("defaults the delegatee to the connected wallet when none is passed", () => {
      renderModal({ delegatee: undefined });
      expect(screen.getByText("GWALLET")).toBeInTheDocument();
    });

    it("disables confirmation when the wallet is not connected", () => {
      wallet = { ...connectedWallet(), isConnected: false, publicKey: null };
      mockUseWallet.mockReturnValue(wallet);

      renderModal();

      expect(screen.getByRole("button", { name: "Confirm & Sign" })).toBeDisabled();
    });
  });

  describe("vote option selection", () => {
    it("asks for a vote option before submitting", async () => {
      renderModal();

      fireEvent.click(screen.getByRole("button", { name: "Confirm & Sign" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Select a vote option first."));
      expect(mockGovernorClient.castVoteWithSign).not.toHaveBeenCalled();
    });

    it("marks the chosen option as checked", () => {
      renderModal();

      fireEvent.click(screen.getByRole("radio", { name: "Vote For" }));

      expect(screen.getByRole("radio", { name: "Vote For" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: "Vote Against" })).toHaveAttribute("aria-checked", "false");
    });

    it("starts with the preselected option", () => {
      renderModal({ preselectedSupport: VoteSupport.Abstain });
      expect(screen.getByRole("radio", { name: "Vote Abstain" })).toHaveAttribute("aria-checked", "true");
    });
  });

  describe("fee estimation", () => {
    it("estimates the fee for the chosen option and shows it in XLM", async () => {
      renderModal();

      fireEvent.click(screen.getByRole("radio", { name: "Vote Against" }));

      await waitFor(() =>
        expect(mockGovernorClient.estimateVoteGas).toHaveBeenCalledWith(
          "GDELEGATE",
          42n,
          VoteSupport.Against,
        ),
      );
      expect(await screen.findByText("~0.000100 XLM")).toBeInTheDocument();
    });

    it("shows a pending state while the estimate is in flight", () => {
      mockGovernorClient.estimateVoteGas.mockReturnValue(new Promise(() => undefined));

      renderModal({ preselectedSupport: VoteSupport.For });

      expect(screen.getByText("Estimating...")).toBeInTheDocument();
    });

    it("shows the simulation error when the estimate fails", async () => {
      mockGovernorClient.estimateVoteGas.mockResolvedValue({ ok: false, error: "Simulation failed" });

      renderModal({ preselectedSupport: VoteSupport.For });

      expect(await screen.findByText("Simulation failed")).toBeInTheDocument();
    });

    it("shows the thrown error when the estimate rejects", async () => {
      mockGovernorClient.estimateVoteGas.mockRejectedValue(new Error("RPC timeout"));

      renderModal({ preselectedSupport: VoteSupport.For });

      expect(await screen.findByText("RPC timeout")).toBeInTheDocument();
    });
  });

  describe("submission", () => {
    it("signs and submits the vote with the connected wallet, then closes", async () => {
      const { props } = renderModal({ preselectedSupport: VoteSupport.For });

      fireEvent.click(screen.getByRole("button", { name: "Confirm & Sign" }));

      await waitFor(() =>
        expect(mockGovernorClient.castVoteWithSign).toHaveBeenCalledWith(
          "GWALLET",
          42n,
          VoteSupport.For,
          wallet.signTransaction,
        ),
      );
      expect(toast.success).toHaveBeenCalledWith("Vote submitted!", { duration: 8000 });
      expect(props.onVoted).toHaveBeenCalledTimes(1);
      expect(props.onSuccess).toHaveBeenCalledTimes(1);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("maps a proposal-not-active failure to a friendly message and stays open", async () => {
      mockGovernorClient.castVoteWithSign.mockRejectedValue(
        new Error("Error(Contract, #28) ProposalNotActive"),
      );
      const { props } = renderModal({ preselectedSupport: VoteSupport.For });

      fireEvent.click(screen.getByRole("button", { name: "Confirm & Sign" }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Voting has ended for this proposal"),
      );
      expect(props.onClose).not.toHaveBeenCalled();
      expect(props.onVoted).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Confirm & Sign" })).toBeEnabled(),
      );
    });

    it("reports other failures with the original message", async () => {
      mockGovernorClient.castVoteWithSign.mockRejectedValue(new Error("Simulation exploded"));

      renderModal({ preselectedSupport: VoteSupport.For });
      fireEvent.click(screen.getByRole("button", { name: "Confirm & Sign" }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Failed to submit vote: Simulation exploded"),
      );
    });

    it("closes without submitting when Cancel is clicked", () => {
      const { props } = renderModal({ preselectedSupport: VoteSupport.For });

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(mockGovernorClient.castVoteWithSign).not.toHaveBeenCalled();
    });

    it("closes when Escape is pressed", () => {
      const { props } = renderModal();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("display", () => {
    it("caps the optional reason at 256 characters", () => {
      renderModal();

      const reason = screen.getByLabelText(/Optional reason/) as HTMLTextAreaElement;
      fireEvent.change(reason, { target: { value: "x".repeat(300) } });

      expect(reason.value).toHaveLength(256);
    });

    it("shows the share of total supply when the total supply is configured", () => {
      process.env.NEXT_PUBLIC_TOTAL_SUPPLY = "10000000";

      renderModal({ votingPower: 4_000_000n });

      expect(screen.getByText("(40%)")).toBeInTheDocument();
    });

    it("shows the quadratic vote weight when quadratic voting is enabled", () => {
      (computeQuadraticWeight as unknown as jest.Mock).mockReturnValue(100n);

      renderModal({ voteType: VoteType.Quadratic, votingPower: 4_000_000n });

      expect(computeQuadraticWeight).toHaveBeenCalledWith(4_000_000n);
      expect(screen.getByText(/Vote weight: 100 \(quadratic\)/)).toBeInTheDocument();
    });
  });
});

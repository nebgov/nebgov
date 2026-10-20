import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { AnchorVerifiedBadge } from "../AnchorVerifiedBadge";
import { SignalingClient } from "@nebgov/sdk";
import * as nebgovEnv from "../../lib/nebgov-env";

jest.mock("@nebgov/sdk", () => ({
  SignalingClient: jest.fn(),
}));

jest.mock("../../lib/nebgov-env", () => ({
  readGovernorConfig: jest.fn(),
}));

const mockSignalingClient = SignalingClient as jest.Mock;
const mockReadGovernorConfig = nebgovEnv.readGovernorConfig as jest.Mock;

describe("AnchorVerifiedBadge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("unavailable states", () => {
    it("returns null when resultHash is null", () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      const { container } = render(
        <AnchorVerifiedBadge pollId={1} resultHash={null} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("returns null when config is missing", () => {
      mockReadGovernorConfig.mockReturnValue(null);
      const { container } = render(
        <AnchorVerifiedBadge pollId={1} resultHash="hash123" />
      );
      expect(container.firstChild).toBeNull();
    });

    it("returns null when signalAnchorAddress is missing", () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: null });
      const { container } = render(
        <AnchorVerifiedBadge pollId={1} resultHash="hash123" />
      );
      expect(container.firstChild).toBeNull();
    });

    it("returns null while loading", () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: jest.fn(() => new Promise(() => {})), // Never resolves
      }));

      const { container } = render(
        <AnchorVerifiedBadge pollId={1} resultHash="hash123" />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("unanchored state", () => {
    it("returns null when anchor does not exist", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      const mockGetAnchor = jest.fn(() => Promise.resolve(null));
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: mockGetAnchor,
      }));

      const { container } = render(
        <AnchorVerifiedBadge pollId={1} resultHash="hash123" />
      );

      await waitFor(() => {
        expect(mockGetAnchor).toHaveBeenCalledWith(1);
        expect(container.firstChild).toBeNull();
      });
    });
  });

  describe("verified state", () => {
    it("displays verified badge when hashes match", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      const mockGetAnchor = jest.fn(() =>
        Promise.resolve({ resultHash: "matching-hash-value" })
      );
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: mockGetAnchor,
      }));

      render(<AnchorVerifiedBadge pollId={1} resultHash="matching-hash-value" />);

      await waitFor(() => {
        expect(screen.getByText("✅ Anchor verified")).toBeInTheDocument();
      });
    });

    it("displays correct title on verified badge", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: jest.fn(() =>
          Promise.resolve({ resultHash: "hash123" })
        ),
      }));

      render(<AnchorVerifiedBadge pollId={1} resultHash="hash123" />);

      await waitFor(() => {
        const badge = screen.getByText("✅ Anchor verified");
        expect(badge).toHaveAttribute(
          "title",
          "This poll's result hash matches its on-chain anchor — it cannot have been edited after publication."
        );
      });
    });

    it("applies correct styling to verified badge", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: jest.fn(() =>
          Promise.resolve({ resultHash: "hash123" })
        ),
      }));

      render(<AnchorVerifiedBadge pollId={1} resultHash="hash123" />);

      await waitFor(() => {
        const badge = screen.getByText("✅ Anchor verified");
        expect(badge).toHaveClass("bg-green-100");
        expect(badge).toHaveClass("text-green-800");
      });
    });
  });

  describe("mismatch state", () => {
    it("displays mismatch badge when hashes do not match", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      const mockGetAnchor = jest.fn(() =>
        Promise.resolve({ resultHash: "on-chain-hash" })
      );
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: mockGetAnchor,
      }));

      render(<AnchorVerifiedBadge pollId={1} resultHash="backend-hash" />);

      await waitFor(() => {
        expect(screen.getByText("⚠️ Anchor mismatch")).toBeInTheDocument();
      });
    });

    it("displays correct title on mismatch badge", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: jest.fn(() =>
          Promise.resolve({ resultHash: "different" })
        ),
      }));

      render(<AnchorVerifiedBadge pollId={1} resultHash="hash123" />);

      await waitFor(() => {
        const badge = screen.getByText("⚠️ Anchor mismatch");
        expect(badge).toHaveAttribute(
          "title",
          "The published result hash does not match the on-chain anchor."
        );
      });
    });

    it("applies correct styling to mismatch badge", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: jest.fn(() =>
          Promise.resolve({ resultHash: "different" })
        ),
      }));

      render(<AnchorVerifiedBadge pollId={1} resultHash="hash123" />);

      await waitFor(() => {
        const badge = screen.getByText("⚠️ Anchor mismatch");
        expect(badge).toHaveClass("bg-rose-100");
        expect(badge).toHaveClass("text-rose-800");
      });
    });
  });

  describe("error handling", () => {
    it("returns null when getAnchor throws error", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      const mockGetAnchor = jest.fn(() =>
        Promise.reject(new Error("Network error"))
      );
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: mockGetAnchor,
      }));

      const { container } = render(
        <AnchorVerifiedBadge pollId={1} resultHash="hash123" />
      );

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });
  });

  describe("prop changes", () => {
    it("refetches anchor when pollId changes", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      const mockGetAnchor = jest.fn(() =>
        Promise.resolve({ resultHash: "hash1" })
      );
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: mockGetAnchor,
      }));

      const { rerender } = render(
        <AnchorVerifiedBadge pollId={1} resultHash="hash1" />
      );

      await waitFor(() => {
        expect(mockGetAnchor).toHaveBeenCalledWith(1);
      });

      rerender(<AnchorVerifiedBadge pollId={2} resultHash="hash1" />);

      await waitFor(() => {
        expect(mockGetAnchor).toHaveBeenCalledWith(2);
      });
    });

    it("refetches anchor when resultHash changes", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      const mockGetAnchor = jest.fn(() =>
        Promise.resolve({ resultHash: "hash1" })
      );
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: mockGetAnchor,
      }));

      const { rerender } = render(
        <AnchorVerifiedBadge pollId={1} resultHash="hash1" />
      );

      await waitFor(() => {
        expect(mockGetAnchor).toHaveBeenCalled();
      });

      jest.clearAllMocks();
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: mockGetAnchor,
      }));

      rerender(<AnchorVerifiedBadge pollId={1} resultHash="hash2" />);

      await waitFor(() => {
        expect(mockGetAnchor).toHaveBeenCalled();
      });
    });
  });

  describe("cleanup", () => {
    it("cancels pending request on unmount", async () => {
      mockReadGovernorConfig.mockReturnValue({ signalAnchorAddress: "0xabc" });
      let resolveAnchor: Function;
      const mockGetAnchor = jest.fn(
        () => new Promise((resolve) => {
          resolveAnchor = resolve;
        })
      );
      mockSignalingClient.mockImplementation(() => ({
        getAnchor: mockGetAnchor,
      }));

      const { unmount } = render(
        <AnchorVerifiedBadge pollId={1} resultHash="hash123" />
      );

      unmount();

      // Resolve the promise after unmount — component should not update
      resolveAnchor!({ resultHash: "hash123" });

      // Should not throw or cause warnings
      expect(screen.queryByText("✅ Anchor verified")).not.toBeInTheDocument();
    });
  });
});

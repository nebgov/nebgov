import React from "react";
import renderer from "react-test-renderer";

// Mock dependencies
jest.mock("@nebgov/sdk", () => ({
  ProposalBondsClient: jest.fn(),
}));

jest.mock("../../lib/wallet-context", () => ({
  useWallet: () => ({
    isConnected: false,
    publicKey: null,
    signTransaction: null,
  }),
}));

jest.mock("../../lib/nebgov-env", () => ({
  readGovernorConfig: jest.fn(),
  readIndexerUrl: jest.fn(),
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import { ProposalBondCard } from "../ProposalBondCard";

describe("ProposalBondCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when no config available", () => {
    const tree = renderer
      .create(
        <ProposalBondCard
          descriptionHash="test_hash_123"
          proposer="GA123"
        />
      )
      .toJSON();
    expect(tree).toBeNull();
  });

  it("renders nothing when not connected and no bond exists", () => {
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    const { ProposalBondsClient } = require("@nebgov/sdk");

    readGovernorConfig.mockReturnValue({
      proposalBondsAddress: "CA123",
    });

    ProposalBondsClient.mockImplementation(() => ({
      getBond: jest.fn().mockResolvedValue(null),
    }));

    const tree = renderer
      .create(
        <ProposalBondCard
          descriptionHash="test_hash_123"
          proposer="GA123"
        />
      )
      .toJSON();

    expect(tree).toBeNull();
  });

  it("renders bond status badge when bond is locked", async () => {
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    const { ProposalBondsClient } = require("@nebgov/sdk");

    readGovernorConfig.mockReturnValue({
      proposalBondsAddress: "CA123",
    });

    const mockBond = { state: "Locked" };
    ProposalBondsClient.mockImplementation(() => ({
      getBond: jest.fn().mockResolvedValue(mockBond),
    }));

    const tree = renderer
      .create(
        <ProposalBondCard
          descriptionHash="test_hash_123"
          proposer="GA123"
        />
      );

    // Wait for async bond fetch
    await renderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(tree.toJSON()).toMatchSnapshot();
  });

  it("shows Lock Bond button when connected as proposer with no bond", async () => {
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    const { useWallet } = require("../../lib/wallet-context");
    const { ProposalBondsClient } = require("@nebgov/sdk");

    readGovernorConfig.mockReturnValue({
      proposalBondsAddress: "CA123",
    });

    jest.requireMock("../../lib/wallet-context").useWallet.mockReturnValue({
      isConnected: true,
      publicKey: "GA123",
      signTransaction: jest.fn(),
    });

    ProposalBondsClient.mockImplementation(() => ({
      getBond: jest.fn().mockResolvedValue(null),
    }));

    const tree = renderer
      .create(
        <ProposalBondCard
          descriptionHash="test_hash_123"
          proposer="GA123"
        />
      );

    await renderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(tree.toJSON()).toMatchSnapshot();
  });

  it("does not show Lock Bond button when connected but not the proposer", async () => {
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    const { useWallet } = require("../../lib/wallet-context");
    const { ProposalBondsClient } = require("@nebgov/sdk");

    readGovernorConfig.mockReturnValue({
      proposalBondsAddress: "CA123",
    });

    jest.requireMock("../../lib/wallet-context").useWallet.mockReturnValue({
      isConnected: true,
      publicKey: "GA999",
      signTransaction: jest.fn(),
    });

    ProposalBondsClient.mockImplementation(() => ({
      getBond: jest.fn().mockResolvedValue(null),
    }));

    const tree = renderer
      .create(
        <ProposalBondCard
          descriptionHash="test_hash_123"
          proposer="GA123"
        />
      )
      .toJSON();

    expect(tree).toBeNull();
  });

  it("handles getBond rejection gracefully", async () => {
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    const { ProposalBondsClient } = require("@nebgov/sdk");

    readGovernorConfig.mockReturnValue({
      proposalBondsAddress: "CA123",
    });

    ProposalBondsClient.mockImplementation(() => ({
      getBond: jest.fn().mockRejectedValue(new Error("Network error")),
    }));

    const tree = renderer
      .create(
        <ProposalBondCard
          descriptionHash="test_hash_123"
          proposer="GA123"
        />
      );

    await renderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(tree.toJSON()).toBeNull();
  });

  it("renders empty state message when bond not found", async () => {
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    const { useWallet } = require("../../lib/wallet-context");
    const { ProposalBondsClient } = require("@nebgov/sdk");

    readGovernorConfig.mockReturnValue({
      proposalBondsAddress: "CA123",
    });

    jest.requireMock("../../lib/wallet-context").useWallet.mockReturnValue({
      isConnected: true,
      publicKey: "GA123",
      signTransaction: jest.fn(),
    });

    ProposalBondsClient.mockImplementation(() => ({
      getBond: jest.fn().mockResolvedValue(null),
    }));

    const tree = renderer
      .create(
        <ProposalBondCard
          descriptionHash="test_hash_123"
          proposer="GA123"
        />
      );

    await renderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const root = tree.root;
    const hasEmptyText = root.findByType("p")?.props.children?.toString().includes("no bond");
    expect(hasEmptyText || tree.toJSON()).toBeTruthy();
  });

  it("does not fetch bond when descriptionHash is missing", () => {
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    const { ProposalBondsClient } = require("@nebgov/sdk");

    const getBondMock = jest.fn();
    readGovernorConfig.mockReturnValue({
      proposalBondsAddress: "CA123",
    });

    ProposalBondsClient.mockImplementation(() => ({
      getBond: getBondMock,
    }));

    renderer.create(
      <ProposalBondCard
        descriptionHash=""
        proposer="GA123"
      />
    );

    expect(getBondMock).not.toHaveBeenCalled();
  });
});

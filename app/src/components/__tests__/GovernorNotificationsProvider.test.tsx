/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, act } from "@testing-library/react";
import { GovernorNotificationsProvider } from "../GovernorNotificationsProvider";

jest.mock("../../lib/wallet-context", () => ({
  useWallet: jest.fn(),
}));

jest.mock("../../lib/nebgov-env", () => ({
  readGovernorConfig: jest.fn(),
  readIndexerUrl: jest.fn(() => null),
  subscriptionOptsFromConfig: jest.fn(() => ({})),
}));

jest.mock("../../lib/governance-notifications", () => ({
  appendNotificationHistory: jest.fn(),
  loadNotificationToggles: jest.fn(() => ({
    active: true,
    outcome: true,
    queued: true,
    executed: true,
    voting_ends_soon: true,
    created_self: true,
  })),
  loadProposalMeta: jest.fn(() => ({})),
  mergeProposalMetaEntry: jest.fn(),
  saveProposalMeta: jest.fn(),
}));

jest.mock("@nebgov/sdk", () => ({
  GovernorClient: jest.fn(() => ({
    getLatestLedger: jest.fn().mockResolvedValue(1000),
    proposalCount: jest.fn().mockResolvedValue(0n),
    getProposalState: jest.fn(),
  })),
  ProposalState: {
    Pending: "Pending",
    Active: "Active",
    Succeeded: "Succeeded",
    Defeated: "Defeated",
    Queued: "Queued",
    Executed: "Executed",
  },
  subscribeToProposals: jest.fn(() => jest.fn()),
  getProposalEvents: jest.fn().mockResolvedValue([]),
  parseProposalCreatedEvent: jest.fn(() => null),
  streamEvents: jest.fn(() => jest.fn()),
}));

import { useWallet } from "../../lib/wallet-context";
import { readGovernorConfig } from "../../lib/nebgov-env";

const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockReadGovernorConfig = readGovernorConfig as jest.MockedFunction<typeof readGovernorConfig>;

describe("GovernorNotificationsProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWallet.mockReturnValue({
      isConnected: false,
      publicKey: null,
      address: null,
      isConnecting: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as any);
    mockReadGovernorConfig.mockReturnValue(null);
  });

  it("renders children", () => {
    render(
      <GovernorNotificationsProvider>
        <span data-testid="child">hello</span>
      </GovernorNotificationsProvider>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders multiple children", () => {
    render(
      <GovernorNotificationsProvider>
        <span data-testid="a">A</span>
        <span data-testid="b">B</span>
      </GovernorNotificationsProvider>
    );
    expect(screen.getByTestId("a")).toBeInTheDocument();
    expect(screen.getByTestId("b")).toBeInTheDocument();
  });

  it("does not start polling when wallet is disconnected", async () => {
    const { GovernorClient } = jest.requireMock("@nebgov/sdk");
    mockUseWallet.mockReturnValue({
      isConnected: false,
      publicKey: null,
    } as any);

    await act(async () => {
      render(
        <GovernorNotificationsProvider>
          <span>child</span>
        </GovernorNotificationsProvider>
      );
    });

    expect(GovernorClient).not.toHaveBeenCalled();
  });

  it("does not start polling when governor config is missing", async () => {
    const { GovernorClient } = jest.requireMock("@nebgov/sdk");
    mockUseWallet.mockReturnValue({
      isConnected: true,
      publicKey: "GTEST123",
    } as any);
    mockReadGovernorConfig.mockReturnValue(null);

    await act(async () => {
      render(
        <GovernorNotificationsProvider>
          <span>child</span>
        </GovernorNotificationsProvider>
      );
    });

    expect(GovernorClient).not.toHaveBeenCalled();
  });

  it("starts polling when wallet is connected and config is present", async () => {
    const { GovernorClient } = jest.requireMock("@nebgov/sdk");
    mockUseWallet.mockReturnValue({
      isConnected: true,
      publicKey: "GTEST123",
    } as any);
    mockReadGovernorConfig.mockReturnValue({
      governorAddress: "GADDR",
      rpcUrl: "https://rpc.test",
    } as any);

    await act(async () => {
      render(
        <GovernorNotificationsProvider>
          <span>child</span>
        </GovernorNotificationsProvider>
      );
    });

    expect(GovernorClient).toHaveBeenCalled();
  });

  it("cleans up on unmount", async () => {
    const unsubProposals = jest.fn();
    const { subscribeToProposals } = jest.requireMock("@nebgov/sdk");
    (subscribeToProposals as jest.Mock).mockReturnValue(unsubProposals);

    mockUseWallet.mockReturnValue({
      isConnected: true,
      publicKey: "GTEST123",
    } as any);
    mockReadGovernorConfig.mockReturnValue({
      governorAddress: "GADDR",
      rpcUrl: "https://rpc.test",
    } as any);

    let unmount: () => void;
    await act(async () => {
      ({ unmount } = render(
        <GovernorNotificationsProvider>
          <span>child</span>
        </GovernorNotificationsProvider>
      ));
    });

    await act(async () => {
      unmount!();
    });

    expect(unsubProposals).toHaveBeenCalled();
  });

  it("resets state when wallet disconnects", async () => {
    const { GovernorClient } = jest.requireMock("@nebgov/sdk");
    mockUseWallet.mockReturnValue({
      isConnected: true,
      publicKey: "GTEST123",
    } as any);
    mockReadGovernorConfig.mockReturnValue({
      governorAddress: "GADDR",
      rpcUrl: "https://rpc.test",
    } as any);

    const { rerender } = render(
      <GovernorNotificationsProvider>
        <span data-testid="child">child</span>
      </GovernorNotificationsProvider>
    );

    mockUseWallet.mockReturnValue({
      isConnected: false,
      publicKey: null,
    } as any);

    await act(async () => {
      rerender(
        <GovernorNotificationsProvider>
          <span data-testid="child">child</span>
        </GovernorNotificationsProvider>
      );
    });

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});

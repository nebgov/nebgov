/**
 * @jest-environment jsdom
 */

import React from "react";
import { Networks } from "@stellar/stellar-sdk";
import { act, renderHook, waitFor } from "@testing-library/react";
import { WalletProvider, useWallet } from "../wallet-context";
import { backendFetch, setAuthToken } from "../backend";

const mockKit = {
  setWallet: jest.fn(),
  getAddress: jest.fn(),
  openModal: jest.fn(),
  signTransaction: jest.fn(),
  signAuthEntry: jest.fn(),
  signMessage: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: jest.fn().mockImplementation(() => mockKit),
  WalletNetwork: { TESTNET: "TESTNET", PUBLIC: "PUBLIC" },
  FREIGHTER_ID: "freighter",
  FreighterModule: jest.fn(),
  xBullModule: jest.fn(),
  AlbedoModule: jest.fn(),
}));

jest.mock("../backend", () => ({
  backendFetch: jest.fn(),
  setAuthToken: jest.fn(),
}));

jest.mock("../governance-notifications", () => ({
  syncNotificationsFromBackend: jest.fn().mockResolvedValue(undefined),
}));

const mockBackendFetch = backendFetch as jest.Mock;
const mockSetAuthToken = setAuthToken as jest.Mock;

const KEY = "GCONNECTEDWALLETKEY0123456789ABCDEFGHIJKLMNOPQRSTUVW";
const SHORT = `${KEY.slice(0, 4)}...${KEY.slice(-4)}`;
const STORAGE_KEY = "nebgov_wallet_id";

type E2EWindow = { __E2E_MOCK_WALLET__?: { publicKey: string; address: string } };

function renderWallet() {
  return renderHook(() => useWallet(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <WalletProvider>{children}</WalletProvider>
    ),
  });
}

function resetKit() {
  for (const fn of Object.values(mockKit)) {
    fn.mockReset();
  }
  mockKit.getAddress.mockResolvedValue({ address: KEY });
  mockKit.openModal.mockResolvedValue(undefined);
  mockKit.signTransaction.mockResolvedValue({ signedTxXdr: "signed-xdr" });
  mockKit.signAuthEntry.mockResolvedValue({ signedAuthEntry: "signed-entry" });
  mockKit.signMessage.mockResolvedValue({ signedMessage: "signed-message" });
  mockKit.disconnect.mockResolvedValue(undefined);
}

describe("WalletProvider / useWallet", () => {
  beforeEach(() => {
    localStorage.clear();
    resetKit();
    mockSetAuthToken.mockReset();
    mockBackendFetch.mockReset();
    mockBackendFetch.mockImplementation(async (path: string) => {
      if (path === "/auth/challenge") {
        return { nonce: "nonce-1", message: "challenge-message" };
      }
      if (path === "/auth/login") {
        return { accessToken: "jwt-token" };
      }
      throw new Error(`unexpected backend call: ${path}`);
    });
    delete (window as unknown as E2EWindow).__E2E_MOCK_WALLET__;
  });

  it("throws when useWallet is used outside the provider", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useWallet())).toThrow(
        "useWallet must be used inside <WalletProvider>",
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("starts disconnected when no wallet was remembered", () => {
    const { result } = renderWallet();

    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
    expect(result.current.publicKey).toBeNull();
    expect(mockKit.getAddress).not.toHaveBeenCalled();
  });

  it("restores a remembered wallet session on load", async () => {
    localStorage.setItem(STORAGE_KEY, "freighter");

    const { result } = renderWallet();

    await waitFor(() => expect(result.current.publicKey).toBe(KEY));
    expect(result.current.address).toBe(SHORT);
    expect(result.current.isConnected).toBe(true);
    expect(mockKit.setWallet).toHaveBeenCalledWith("freighter");
    expect(mockKit.getAddress).toHaveBeenCalledWith({ skipRequestAccess: true });

    await waitFor(() => expect(mockSetAuthToken).toHaveBeenCalledWith("jwt-token"));
    expect(mockBackendFetch).toHaveBeenCalledWith(
      "/auth/challenge",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forgets a remembered wallet that can no longer provide an address", async () => {
    localStorage.setItem(STORAGE_KEY, "freighter");
    mockKit.getAddress.mockRejectedValueOnce(new Error("wallet locked"));

    const { result } = renderWallet();

    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
    expect(result.current.publicKey).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it("resolves connect() with the freshly connected key (the #926 stale-closure fix)", async () => {
    mockKit.openModal.mockImplementation(async ({ onWalletSelected }: any) => {
      await onWalletSelected({ id: "freighter", name: "Freighter" });
    });

    const { result } = renderWallet();

    let connected: string | null = null;
    await act(async () => {
      connected = await result.current.connect();
    });

    expect(connected).toBe(KEY);
    expect(result.current.publicKey).toBe(KEY);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isConnecting).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("freighter");
  });

  it("resolves connect() with null and records the error when the modal is closed", async () => {
    mockKit.openModal.mockRejectedValue(new Error("User closed modal"));

    const { result } = renderWallet();

    let connected: string | null = "unset";
    await act(async () => {
      connected = await result.current.connect();
    });

    expect(connected).toBeNull();
    expect(result.current.publicKey).toBeNull();
    expect(result.current.error).toBe("User closed modal");
    expect(result.current.isConnecting).toBe(false);
  });

  it("resolves connect() with null when the wallet refuses to share an address", async () => {
    mockKit.openModal.mockImplementation(async ({ onWalletSelected }: any) => {
      await onWalletSelected({ id: "freighter", name: "Freighter" });
    });
    mockKit.getAddress.mockRejectedValueOnce(new Error("Wallet locked"));

    const { result } = renderWallet();

    let connected: string | null = "unset";
    await act(async () => {
      connected = await result.current.connect();
    });

    expect(connected).toBeNull();
    expect(result.current.publicKey).toBeNull();
    expect(result.current.error).toBe("Wallet locked");
  });

  it("uses the E2E mock wallet without opening the wallet modal", async () => {
    (window as unknown as E2EWindow).__E2E_MOCK_WALLET__ = {
      publicKey: KEY,
      address: SHORT,
    };

    const { result } = renderWallet();

    let connected: string | null = null;
    await act(async () => {
      connected = await result.current.connect();
    });

    expect(connected).toBe(KEY);
    expect(result.current.publicKey).toBe(KEY);
    expect(mockKit.openModal).not.toHaveBeenCalled();
  });

  it("signs transactions, auth entries and messages for the connected address", async () => {
    localStorage.setItem(STORAGE_KEY, "freighter");
    const { result } = renderWallet();
    await waitFor(() => expect(result.current.publicKey).toBe(KEY));

    const passphrase = { address: KEY, networkPassphrase: Networks.TESTNET };

    await expect(result.current.signTransaction("tx-xdr")).resolves.toBe("signed-xdr");
    expect(mockKit.signTransaction).toHaveBeenCalledWith("tx-xdr", passphrase);

    await expect(result.current.signAuthEntry("preimage")).resolves.toBe("signed-entry");
    expect(mockKit.signAuthEntry).toHaveBeenCalledWith("preimage", passphrase);

    await expect(result.current.signMessage("hello")).resolves.toBe("signed-message");
    expect(mockKit.signMessage).toHaveBeenCalledWith("hello", passphrase);
  });

  it("refuses to sign while disconnected", async () => {
    const { result } = renderWallet();

    await expect(result.current.signTransaction("x")).rejects.toThrow(
      "Connect your wallet first.",
    );
    await expect(result.current.signAuthEntry("x")).rejects.toThrow(
      "Connect your wallet first.",
    );
    await expect(result.current.signMessage("x")).rejects.toThrow(
      "Connect your wallet first.",
    );
    expect(mockKit.signTransaction).not.toHaveBeenCalled();
    expect(mockKit.signAuthEntry).not.toHaveBeenCalled();
    expect(mockKit.signMessage).not.toHaveBeenCalled();
  });

  it("disconnect clears state, the auth token and the remembered wallet", async () => {
    localStorage.setItem(STORAGE_KEY, "freighter");
    const { result } = renderWallet();
    await waitFor(() => expect(mockSetAuthToken).toHaveBeenCalledWith("jwt-token"));

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockKit.disconnect).toHaveBeenCalled();
    expect(result.current.publicKey).toBeNull();
    expect(result.current.address).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(mockSetAuthToken).toHaveBeenLastCalledWith(null);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("still clears state when the wallet kit fails to disconnect", async () => {
    localStorage.setItem(STORAGE_KEY, "freighter");
    mockKit.disconnect.mockRejectedValueOnce(new Error("already disconnected"));
    const { result } = renderWallet();
    await waitFor(() => expect(result.current.publicKey).toBe(KEY));

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

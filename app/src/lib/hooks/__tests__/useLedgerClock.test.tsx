/**
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { useLedgerClock } from "../useLedgerClock";

const mockServer = {
  getHealth: jest.fn(),
  getLatestLedger: jest.fn(),
};

jest.mock("@stellar/stellar-sdk", () => ({
  SorobanRpc: {
    Server: jest.fn(() => mockServer),
  },
}));

describe("useLedgerClock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockServer.getHealth.mockResolvedValue({ status: "healthy" });
    mockServer.getLatestLedger.mockResolvedValue({ sequence: 12345 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fetches the latest ledger and clears the loading state", async () => {
    const { result } = renderHook(() => useLedgerClock());

    expect(result.current.isLoading).toBe(true);
    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.currentLedger).toBe(12345);
    expect(mockServer.getHealth).toHaveBeenCalledTimes(1);
    expect(mockServer.getLatestLedger).toHaveBeenCalledTimes(1);
  });

  it("polls the ledger every 30 seconds", async () => {
    renderHook(() => useLedgerClock());
    await act(async () => {});

    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(mockServer.getHealth).toHaveBeenCalledTimes(2);

    mockServer.getLatestLedger.mockResolvedValue({ sequence: 12346 });
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(mockServer.getHealth).toHaveBeenCalledTimes(3);
  });

  it("exposes errors from the RPC server", async () => {
    mockServer.getHealth.mockRejectedValue(new Error("rpc unreachable"));
    const { result } = renderHook(() => useLedgerClock());

    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error?.message).toBe("rpc unreachable");
    expect(result.current.currentLedger).toBe(0);
  });

  it("does not update the ledger when the server is unhealthy", async () => {
    mockServer.getHealth.mockResolvedValue({ status: "degraded" });
    const { result } = renderHook(() => useLedgerClock());

    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.currentLedger).toBe(0);
    expect(mockServer.getLatestLedger).not.toHaveBeenCalled();
  });

  it("clears the polling interval on unmount", async () => {
    const { unmount } = renderHook(() => useLedgerClock());
    await act(async () => {});
    expect(mockServer.getHealth).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      jest.advanceTimersByTime(90000);
    });

    expect(mockServer.getHealth).toHaveBeenCalledTimes(1);
  });
});

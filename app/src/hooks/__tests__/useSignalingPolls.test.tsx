/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { SignalingPoll } from "@nebgov/sdk";
import { useSignalingPolls } from "../useSignalingPolls";

const listPollsMock = jest.fn();
const SignalingClientMock = jest.fn();

jest.mock("@nebgov/sdk", () => ({
  SignalingClient: function (...args: unknown[]) {
    SignalingClientMock(...args);
    return { listPolls: (...a: unknown[]) => listPollsMock(...a) };
  },
}));

jest.mock("../../lib/wallet-context", () => ({
  useWallet: () => ({ isConnected: false, publicKey: null }),
}));

function makePoll(id: number, finalized = false): SignalingPoll {
  return {
    id,
    creatorAddress: "GCREATOR",
    title: `Poll ${id}`,
    description: "Should we do the thing?",
    choices: ["Yes", "No"],
    snapshotLedger: 1000,
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-08T00:00:00.000Z",
    finalized,
    resultHash: null,
    anchoredTxHash: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("useSignalingPolls", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("starts with an empty poll list and no error", () => {
    listPollsMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSignalingPolls());

    expect(result.current.polls).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refresh).toBe("function");
  });

  it("does not fetch when the governor config is missing", async () => {
    delete process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;
    const { result } = renderHook(() => useSignalingPolls());

    await act(async () => {
      await result.current.refresh();
    });

    expect(SignalingClientMock).not.toHaveBeenCalled();
    expect(listPollsMock).not.toHaveBeenCalled();
    expect(result.current.polls).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("loads polls for the requested status", async () => {
    const polls = [makePoll(1), makePoll(2)];
    listPollsMock.mockResolvedValue(polls);
    const { result } = renderHook(() => useSignalingPolls("active"));

    await waitFor(() => expect(result.current.polls).toEqual(polls));

    expect(SignalingClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        governorAddress: "CTEST123...",
        timelockAddress: "CTEST456...",
        votesAddress: "CTEST789...",
        network: "testnet",
      }),
    );
    expect(listPollsMock).toHaveBeenCalledWith("active");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reports loading while the poll list is in flight", async () => {
    let resolve!: (value: SignalingPoll[]) => void;
    listPollsMock.mockReturnValue(
      new Promise<SignalingPoll[]>((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(() => useSignalingPolls());

    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      resolve([makePoll(1)]);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.polls).toHaveLength(1);
  });

  it("surfaces the error message when listing fails", async () => {
    listPollsMock.mockRejectedValue(new Error("backend down"));
    const { result } = renderHook(() => useSignalingPolls());

    await waitFor(() => expect(result.current.error).toBe("backend down"));
    expect(result.current.loading).toBe(false);
    expect(result.current.polls).toEqual([]);
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    listPollsMock.mockRejectedValue("boom");
    const { result } = renderHook(() => useSignalingPolls());

    await waitFor(() =>
      expect(result.current.error).toBe("Failed to load signaling polls"),
    );
  });

  it("refresh re-queries and clears a previous error", async () => {
    listPollsMock.mockRejectedValueOnce(new Error("transient"));
    const { result } = renderHook(() => useSignalingPolls());

    await waitFor(() => expect(result.current.error).toBe("transient"));

    listPollsMock.mockResolvedValueOnce([makePoll(3)]);
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.polls).toEqual([makePoll(3)]);
  });

  it("refetches when the status filter changes", async () => {
    listPollsMock.mockImplementation(async (status?: string) =>
      status === "closed" ? [makePoll(9, true)] : [makePoll(1)],
    );
    const { result, rerender } = renderHook(
      ({ status }: { status?: "active" | "closed" }) => useSignalingPolls(status),
      { initialProps: { status: "active" as "active" | "closed" } },
    );

    await waitFor(() => expect(result.current.polls).toEqual([makePoll(1)]));

    rerender({ status: "closed" });

    await waitFor(() => expect(result.current.polls).toEqual([makePoll(9, true)]));
    expect(listPollsMock).toHaveBeenLastCalledWith("closed");
  });

  it("auto-refreshes every 30 seconds and stops after unmount", async () => {
    jest.useFakeTimers();
    listPollsMock.mockResolvedValue([makePoll(1)]);
    const { result, unmount } = renderHook(() => useSignalingPolls());

    await waitFor(() => expect(result.current.polls).toHaveLength(1));
    const callsAfterMount = listPollsMock.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(listPollsMock).toHaveBeenCalledTimes(callsAfterMount + 1);

    unmount();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(listPollsMock).toHaveBeenCalledTimes(callsAfterMount + 1);
  });
});

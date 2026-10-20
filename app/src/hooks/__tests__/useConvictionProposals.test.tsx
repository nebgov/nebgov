/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useConvictionProposals } from "../useConvictionProposals";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock readIndexerUrl
jest.mock("../../lib/nebgov-env", () => ({
  readIndexerUrl: jest.fn(),
}));

describe("useConvictionProposals", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Set up indexer URL mock
    const { readIndexerUrl } = require("../../lib/nebgov-env");
    readIndexerUrl.mockReturnValue("http://test-indexer");
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("returns initial loading state", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useConvictionProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot).toBeTruthy();
    expect(snapshot.loading).toBe(true);
    expect(snapshot.proposals).toEqual([]);
    expect(snapshot.error).toBeNull();
    expect(typeof snapshot.refresh).toBe("function");
  });

  it("fetches proposals successfully", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [
          {
            proposal_id: "1",
            proposer: "GABC",
            target: "GDEF",
            requested_amount: "1000",
            conviction: "500",
            last_updated_ledger: 12345,
            executed: false,
            cancelled: false,
          },
          {
            proposal_id: "2",
            proposer: "GXYZ",
            target: "GAAA",
            requested_amount: "2000",
            conviction: "1000",
            last_updated_ledger: 12346,
            executed: true,
            cancelled: false,
          },
        ],
      }),
    });

    let snapshot: any = null;

    function Probe() {
      const state = useConvictionProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.proposals).toEqual([
      {
        proposalId: "1",
        proposer: "GABC",
        target: "GDEF",
        requestedAmount: BigInt(1000),
        conviction: BigInt(500),
        lastUpdatedLedger: 12345,
        executed: false,
        cancelled: false,
      },
      {
        proposalId: "2",
        proposer: "GXYZ",
        target: "GAAA",
        requestedAmount: BigInt(2000),
        conviction: BigInt(1000),
        lastUpdatedLedger: 12346,
        executed: true,
        cancelled: false,
      },
    ]);
    expect(snapshot.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://test-indexer/conviction/proposals?status=active",
      { cache: "no-store" }
    );
  });

  it("handles missing indexer URL error", async () => {
    const { readIndexerUrl } = require("../../lib/nebgov-env");
    readIndexerUrl.mockReturnValue(null);

    let snapshot: any = null;

    function Probe() {
      const state = useConvictionProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.error).toBe("NEXT_PUBLIC_INDEXER_URL is not configured");
    expect(snapshot.proposals).toEqual([]);
  });

  it("handles fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    let snapshot: any = null;

    function Probe() {
      const state = useConvictionProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.error).toBe("Network error");
    expect(snapshot.proposals).toEqual([]);
  });

  it("handles non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    let snapshot: any = null;

    function Probe() {
      const state = useConvictionProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.error).toBe("Indexer returned 500");
    expect(snapshot.proposals).toEqual([]);
  });

  it("handles empty data response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [],
      }),
    });

    let snapshot: any = null;

    function Probe() {
      const state = useConvictionProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.proposals).toEqual([]);
    expect(snapshot.error).toBeNull();
  });

  it("refresh function refetches data", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [
            {
              proposal_id: "1",
              proposer: "GABC",
              target: "GDEF",
              requested_amount: "1000",
              conviction: "500",
              last_updated_ledger: 12345,
              executed: false,
              cancelled: false,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [
            {
              proposal_id: "2",
              proposer: "GXYZ",
              target: "GAAA",
              requested_amount: "2000",
              conviction: "1000",
              last_updated_ledger: 12346,
              executed: true,
              cancelled: false,
            },
          ],
        }),
      });

    let snapshot: any = null;

    function Probe() {
      const state = useConvictionProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.proposals).toHaveLength(1);
    expect(snapshot.proposals[0].proposalId).toBe("1");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await snapshot.refresh();
    });

    await waitFor(() => {
      expect(snapshot.proposals).toHaveLength(1);
      expect(snapshot.proposals[0].proposalId).toBe("2");
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("uses custom status parameter", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [],
      }),
    });

    let snapshot: any = null;

    function Probe() {
      const state = useConvictionProposals("executed");
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://test-indexer/conviction/proposals?status=executed",
      { cache: "no-store" }
    );
  });

  it("polls on interval", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [],
      }),
    });

    let snapshot: any = null;

    function Probe() {
      const state = useConvictionProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Fast-forward 15 seconds
    act(() => {
      jest.advanceTimersByTime(15000);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it("clears interval on unmount", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: [],
      }),
    });

    function Probe() {
      const state = useConvictionProposals();
      return null;
    }

    const { unmount } = render(<Probe />);

    unmount();

    // Fast-forward 15 seconds
    act(() => {
      jest.advanceTimersByTime(15000);
    });

    // Should not have called fetch again after unmount
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

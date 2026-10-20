/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useOptimisticProposals, useOptimisticProposal } from "../useOptimisticProposals";

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

jest.mock("../../lib/nebgov-env", () => ({
  readIndexerUrl: jest.fn(() => "http://localhost:3000"),
}));

describe("useOptimisticProposals", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns initial loading state", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot.loading).toBe(true);
    expect(snapshot.proposals).toEqual([]);
    expect(snapshot.error).toBe(null);
  });

  it("fetches proposals successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            proposal_id: "1",
            proposer: "GAAA",
            created_ledger: 100,
            challenge_end_ledger: 200,
            objection_votes: "0",
            state: "challenge_window",
          },
        ],
      }),
    });

    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
      expect(snapshot.proposals).toHaveLength(1);
      expect(snapshot.proposals[0].proposalId).toBe("1");
      expect(snapshot.error).toBe(null);
    });

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/optimistic/proposals", {
      cache: "no-store",
    });
  });

  it("fetches proposals with status filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposals("passed");
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
      "http://localhost:3000/optimistic/proposals?status=passed",
      { cache: "no-store" }
    );
  });

  it("handles fetch error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
      expect(snapshot.error).toBeTruthy();
      expect(snapshot.error).toContain("Indexer returned 500");
    });
  });

  it("returns a refresh function", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(typeof snapshot.refresh).toBe("function");
  });

  it("refetches when refresh is called", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              proposal_id: "1",
              proposer: "GAAA",
              created_ledger: 100,
              challenge_end_ledger: 200,
              objection_votes: "0",
              state: "challenge_window",
            },
          ],
        }),
      });

    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposals();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    await act(async () => {
      await snapshot.refresh();
    });

    await waitFor(() => {
      expect(snapshot.proposals).toHaveLength(1);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("useOptimisticProposal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns initial loading state", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposal("1");
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot.loading).toBe(true);
    expect(snapshot.proposal).toBe(null);
    expect(snapshot.objections).toEqual([]);
    expect(snapshot.error).toBe(null);
  });

  it("fetches proposal and objections successfully", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          proposal_id: "1",
          proposer: "GAAA",
          created_ledger: 100,
          challenge_end_ledger: 200,
          objection_votes: "100",
          state: "challenge_window",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              objector: "GBBB",
              weight: "50",
              running_total: "50",
              ledger: 150,
            },
          ],
        }),
      });

    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposal("1");
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
      expect(snapshot.proposal).toBeTruthy();
      expect(snapshot.proposal?.proposalId).toBe("1");
      expect(snapshot.objections).toHaveLength(1);
      expect(snapshot.error).toBe(null);
    });

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/optimistic/proposals/1", {
      cache: "no-store",
    });
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/optimistic/proposals/1/objections", {
      cache: "no-store",
    });
  });

  it("handles 404 for non-existent proposal", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      ok: false,
    });

    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposal("999");
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
      expect(snapshot.proposal).toBe(null);
      expect(snapshot.objections).toEqual([]);
    });
  });

  it("handles fetch error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposal("1");
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
      expect(snapshot.error).toBeTruthy();
      expect(snapshot.error).toContain("Indexer returned 500");
    });
  });

  it("handles missing id", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposal(undefined);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot.loading).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refetches when refresh is called", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          proposal_id: "1",
          proposer: "GAAA",
          created_ledger: 100,
          challenge_end_ledger: 200,
          objection_votes: "0",
          state: "challenge_window",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          proposal_id: "1",
          proposer: "GAAA",
          created_ledger: 100,
          challenge_end_ledger: 200,
          objection_votes: "100",
          state: "challenge_window",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    let snapshot: any = null;

    function Probe() {
      const state = useOptimisticProposal("1");
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    await act(async () => {
      await snapshot.refresh();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});

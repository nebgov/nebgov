/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useAmendments } from "../useAmendments";

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe("useAmendments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns initial loading state", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useAmendments(123);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot.loading).toBe(true);
    expect(snapshot.amendments).toEqual([]);
    expect(snapshot.error).toBe(null);
  });

  it("fetches amendments successfully on mount", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        amendments: [{ id: 1, version: 1 }],
        current_amendment_version: 1,
      }),
    });

    let snapshot: any = null;

    function Probe() {
      const state = useAmendments(123);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
      expect(snapshot.amendments).toEqual([{ id: 1, version: 1 }]);
      expect(snapshot.currentVersion).toBe(1);
      expect(snapshot.error).toBe(null);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/proposals/123/amendments"
    );
  });

  it("handles fetch error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: "Not Found",
    });

    let snapshot: any = null;

    function Probe() {
      const state = useAmendments(123);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
      expect(snapshot.error).toBeTruthy();
      expect(snapshot.error?.message).toContain("Failed to fetch amendments");
    });
  });

  it("refetches amendments when fetchAmendments is called", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          amendments: [{ id: 1, version: 1 }],
          current_amendment_version: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          amendments: [{ id: 1, version: 1 }, { id: 2, version: 2 }],
          current_amendment_version: 2,
        }),
      });

    let snapshot: any = null;

    function Probe() {
      const state = useAmendments(123);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
      expect(snapshot.amendments).toHaveLength(1);
    });

    await act(async () => {
      await snapshot.fetchAmendments();
    });

    await waitFor(() => {
      expect(snapshot.amendments).toHaveLength(2);
      expect(snapshot.currentVersion).toBe(2);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("fetches diff successfully", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          amendments: [],
          current_amendment_version: 0,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ op: "replace", path: "/title", value: "New Title" }],
      });

    let snapshot: any = null;

    function Probe() {
      const state = useAmendments(123);
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
      await snapshot.fetchDiff(1, 2);
    });

    await waitFor(() => {
      expect(snapshot.diff).toEqual([
        { op: "replace", path: "/title", value: "New Title" },
      ]);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/proposals/123/amendment-diff/1/2"
    );
  });

  it("handles diff fetch error", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          amendments: [],
          current_amendment_version: 0,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

    let snapshot: any = null;

    function Probe() {
      const state = useAmendments(123);
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
      await snapshot.fetchDiff(1, 2);
    });

    await waitFor(() => {
      expect(snapshot.error).toBeTruthy();
      expect(snapshot.error?.message).toContain("Failed to fetch diff");
    });
  });

  it("submits amendment successfully and refreshes", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          amendments: [],
          current_amendment_version: 0,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          amendments: [{ id: 1, version: 1 }],
          current_amendment_version: 1,
        }),
      });

    let snapshot: any = null;

    function Probe() {
      const state = useAmendments(123);
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
      await snapshot.submitAmendment({ title: "Test" });
    });

    await waitFor(() => {
      expect(snapshot.amendments).toHaveLength(1);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/proposals/123/amend",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test" }),
      })
    );
  });

  it("publishes amendment successfully and refreshes", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          amendments: [],
          current_amendment_version: 0,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          amendments: [{ id: 1, version: 1 }],
          current_amendment_version: 1,
        }),
      });

    let snapshot: any = null;

    function Probe() {
      const state = useAmendments(123);
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
      await snapshot.publishAmendment(1);
    });

    await waitFor(() => {
      expect(snapshot.amendments).toHaveLength(1);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/proposals/123/publish-amendment/1",
      expect.objectContaining({
        method: "POST",
      })
    );
  });
});

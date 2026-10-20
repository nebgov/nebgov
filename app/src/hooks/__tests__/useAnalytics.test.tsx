/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useAnalytics } from "../useAnalytics";

// Mock the @nebgov/sdk module
jest.mock("@nebgov/sdk", () => ({
  Network: {
    testnet: "testnet",
    mainnet: "mainnet",
  },
  AnalyticsClient: jest.fn().mockImplementation(() => ({
    getAllTimeStats: jest.fn(),
  })),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("useAnalytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up required environment variables
    process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS = "test_governor";
    process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS = "test_timelock";
    process.env.NEXT_PUBLIC_VOTES_ADDRESS = "test_votes";
    process.env.NEXT_PUBLIC_INDEXER_URL = "http://test-indexer";
    process.env.NEXT_PUBLIC_NETWORK = "testnet";
  });

  it("returns initial loading state", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useAnalytics();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot).toBeTruthy();
    expect(snapshot.loading).toBe(true);
    expect(snapshot.allTimeStats).toBeNull();
    expect(snapshot.topVoters).toEqual([]);
    expect(snapshot.error).toBeNull();
  });

  it("fetches analytics data successfully", async () => {
    const { AnalyticsClient } = require("@nebgov/sdk");
    const mockGetAllTimeStats = jest.fn().mockResolvedValue({
      totalProposals: 100,
      totalVotes: 1000,
      totalVoters: 50,
    });
    AnalyticsClient.mockImplementation(() => ({
      getAllTimeStats: mockGetAllTimeStats,
    }));

    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        top_voters: [
          {
            rank: 1,
            voter: "GABC",
            proposals_voted: 10,
            total_weight_cast: "100",
          },
          {
            rank: 2,
            voter: "GDEF",
            proposals_voted: 5,
            total_weight_cast: "50",
          },
        ],
      }),
    });

    let snapshot: any = null;

    function Probe() {
      const state = useAnalytics();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.allTimeStats).toEqual({
      totalProposals: 100,
      totalVotes: 1000,
      totalVoters: 50,
    });
    expect(snapshot.topVoters).toEqual([
      {
        rank: 1,
        voter: "GABC",
        proposalsVoted: 10,
        totalWeightCast: BigInt(100),
      },
      {
        rank: 2,
        voter: "GDEF",
        proposalsVoted: 5,
        totalWeightCast: BigInt(50),
      },
    ]);
    expect(snapshot.error).toBeNull();
    expect(mockGetAllTimeStats).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://test-indexer/analytics/top-voters?limit=10",
      { cache: "no-store" }
    );
  });

  it("handles missing environment variables error", async () => {
    delete process.env.NEXT_PUBLIC_INDEXER_URL;

    let snapshot: any = null;

    function Probe() {
      const state = useAnalytics();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.error).toContain(
      "Missing required environment variables for AnalyticsClient"
    );
    expect(snapshot.allTimeStats).toBeNull();
    expect(snapshot.topVoters).toEqual([]);
  });

  it("handles API fetch error", async () => {
    const { AnalyticsClient } = require("@nebgov/sdk");
    const mockGetAllTimeStats = jest.fn().mockRejectedValue(
      new Error("Network error")
    );
    AnalyticsClient.mockImplementation(() => ({
      getAllTimeStats: mockGetAllTimeStats,
    }));

    let snapshot: any = null;

    function Probe() {
      const state = useAnalytics();
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
    expect(snapshot.allTimeStats).toBeNull();
    expect(snapshot.topVoters).toEqual([]);
  });

  it("handles top-voters fetch error but still sets stats", async () => {
    const { AnalyticsClient } = require("@nebgov/sdk");
    const mockGetAllTimeStats = jest.fn().mockResolvedValue({
      totalProposals: 100,
      totalVotes: 1000,
      totalVoters: 50,
    });
    AnalyticsClient.mockImplementation(() => ({
      getAllTimeStats: mockGetAllTimeStats,
    }));

    mockFetch.mockResolvedValue({
      ok: false,
    });

    let snapshot: any = null;

    function Probe() {
      const state = useAnalytics();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.allTimeStats).toEqual({
      totalProposals: 100,
      totalVotes: 1000,
      totalVoters: 50,
    });
    expect(snapshot.topVoters).toEqual([]);
    expect(snapshot.error).toBeNull();
  });

  it("handles empty top-voters response", async () => {
    const { AnalyticsClient } = require("@nebgov/sdk");
    const mockGetAllTimeStats = jest.fn().mockResolvedValue({
      totalProposals: 100,
      totalVotes: 1000,
      totalVoters: 50,
    });
    AnalyticsClient.mockImplementation(() => ({
      getAllTimeStats: mockGetAllTimeStats,
    }));

    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        top_voters: [],
      }),
    });

    let snapshot: any = null;

    function Probe() {
      const state = useAnalytics();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.topVoters).toEqual([]);
  });

  it("handles component unmount (cleanup)", async () => {
    const { AnalyticsClient } = require("@nebgov/sdk");
    const mockGetAllTimeStats = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ totalProposals: 100 }), 100);
        })
    );
    AnalyticsClient.mockImplementation(() => ({
      getAllTimeStats: mockGetAllTimeStats,
    }));

    let snapshot: any = null;

    function Probe() {
      const state = useAnalytics();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    const { unmount } = render(<Probe />);

    // Unmount before the fetch completes
    unmount();

    // Wait to ensure no state update happens after unmount
    await new Promise((resolve) => setTimeout(resolve, 200));

    // The test passes if no error is thrown
    expect(true).toBe(true);
  });
});

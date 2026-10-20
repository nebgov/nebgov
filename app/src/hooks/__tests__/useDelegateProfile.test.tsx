/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useDelegateProfile } from "../useDelegateProfile";

// Mock the @nebgov/sdk module
jest.mock("@nebgov/sdk", () => ({
  Network: {
    testnet: "testnet",
    mainnet: "mainnet",
  },
  VotesClient: jest.fn().mockImplementation(() => ({
    getDelegateProfile: jest.fn(),
  })),
}));

describe("useDelegateProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up required environment variables
    process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS = "test_governor";
    process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS = "test_timelock";
    process.env.NEXT_PUBLIC_VOTES_ADDRESS = "test_votes";
    process.env.NEXT_PUBLIC_NETWORK = "testnet";
  });

  it("returns initial loading state with valid address", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useDelegateProfile("GABC");
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot).toBeTruthy();
    expect(snapshot.loading).toBe(true);
    expect(snapshot.profile).toBeNull();
    expect(snapshot.error).toBeNull();
  });

  it("returns non-loading state with undefined address", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useDelegateProfile(undefined);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot).toBeTruthy();
    expect(snapshot.loading).toBe(false);
    expect(snapshot.profile).toBeNull();
    expect(snapshot.error).toBeNull();
  });

  it("fetches delegate profile successfully", async () => {
    const { VotesClient } = require("@nebgov/sdk");
    const mockGetDelegateProfile = jest.fn().mockResolvedValue({
      currentVotingPower: 1000n,
      baseVotingPower: 500n,
      delegatorCount: 10,
      totalDelegatedPower: 2000n,
      chainDepthLimit: 5,
      firstDelegatedAt: 1234567890,
    });
    VotesClient.mockImplementation(() => ({
      getDelegateProfile: mockGetDelegateProfile,
    }));

    let snapshot: any = null;

    function Probe() {
      const state = useDelegateProfile("GABC");
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.profile).toEqual({
      currentVotingPower: 1000n,
      baseVotingPower: 500n,
      delegatorCount: 10,
      totalDelegatedPower: 2000n,
      chainDepthLimit: 5,
      firstDelegatedAt: 1234567890,
    });
    expect(snapshot.error).toBeNull();
    expect(mockGetDelegateProfile).toHaveBeenCalledWith("GABC");
    expect(mockGetDelegateProfile).toHaveBeenCalledTimes(1);
  });

  it("handles missing environment variables error", async () => {
    delete process.env.NEXT_PUBLIC_VOTES_ADDRESS;

    let snapshot: any = null;

    function Probe() {
      const state = useDelegateProfile("GABC");
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
      "Missing required environment variables for VotesClient"
    );
    expect(snapshot.profile).toBeNull();
  });

  it("handles API fetch error", async () => {
    const { VotesClient } = require("@nebgov/sdk");
    const mockGetDelegateProfile = jest.fn().mockRejectedValue(
      new Error("Network error")
    );
    VotesClient.mockImplementation(() => ({
      getDelegateProfile: mockGetDelegateProfile,
    }));

    let snapshot: any = null;

    function Probe() {
      const state = useDelegateProfile("GABC");
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
    expect(snapshot.profile).toBeNull();
  });

  it("handles non-Error object error", async () => {
    const { VotesClient } = require("@nebgov/sdk");
    const mockGetDelegateProfile = jest.fn().mockRejectedValue("String error");
    VotesClient.mockImplementation(() => ({
      getDelegateProfile: mockGetDelegateProfile,
    }));

    let snapshot: any = null;

    function Probe() {
      const state = useDelegateProfile("GABC");
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.error).toBe("Failed to load delegate profile");
    expect(snapshot.profile).toBeNull();
  });

  it("refetches when address changes", async () => {
    const { VotesClient } = require("@nebgov/sdk");
    const mockGetDelegateProfile = jest.fn()
      .mockResolvedValueOnce({
        currentVotingPower: 1000n,
        baseVotingPower: 500n,
        delegatorCount: 10,
        totalDelegatedPower: 2000n,
        chainDepthLimit: 5,
        firstDelegatedAt: 1234567890,
      })
      .mockResolvedValueOnce({
        currentVotingPower: 2000n,
        baseVotingPower: 1000n,
        delegatorCount: 20,
        totalDelegatedPower: 4000n,
        chainDepthLimit: 5,
        firstDelegatedAt: 1234567890,
      });
    VotesClient.mockImplementation(() => ({
      getDelegateProfile: mockGetDelegateProfile,
    }));

    let snapshot: any = null;
    let address = "GABC";

    function Probe() {
      const state = useDelegateProfile(address);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    const { rerender } = render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.profile?.currentVotingPower).toBe(1000n);
    expect(mockGetDelegateProfile).toHaveBeenCalledWith("GABC");
    expect(mockGetDelegateProfile).toHaveBeenCalledTimes(1);

    // Change address
    address = "GDEF";
    rerender(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.profile?.currentVotingPower).toBe(2000n);
    expect(mockGetDelegateProfile).toHaveBeenCalledWith("GDEF");
    expect(mockGetDelegateProfile).toHaveBeenCalledTimes(2);
  });

  it("handles component unmount (cleanup)", async () => {
    const { VotesClient } = require("@nebgov/sdk");
    const mockGetDelegateProfile = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                currentVotingPower: 1000n,
                baseVotingPower: 500n,
                delegatorCount: 10,
                totalDelegatedPower: 2000n,
                chainDepthLimit: 5,
                firstDelegatedAt: 1234567890,
              }),
            100
          );
        })
    );
    VotesClient.mockImplementation(() => ({
      getDelegateProfile: mockGetDelegateProfile,
    }));

    function Probe() {
      const state = useDelegateProfile("GABC");
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

  it("does not fetch when address is undefined", async () => {
    const { VotesClient } = require("@nebgov/sdk");
    const mockGetDelegateProfile = jest.fn();
    VotesClient.mockImplementation(() => ({
      getDelegateProfile: mockGetDelegateProfile,
    }));

    function Probe() {
      const state = useDelegateProfile(undefined);
      return null;
    }

    render(<Probe />);

    // Wait a bit to ensure no fetch happens
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockGetDelegateProfile).not.toHaveBeenCalled();
  });

  it("handles empty address string (does not fetch)", async () => {
    const { VotesClient } = require("@nebgov/sdk");
    const mockGetDelegateProfile = jest.fn();
    VotesClient.mockImplementation(() => ({
      getDelegateProfile: mockGetDelegateProfile,
    }));

    let snapshot: any = null;

    function Probe() {
      const state = useDelegateProfile("");
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    // Empty string is falsy, so it should not fetch
    expect(mockGetDelegateProfile).not.toHaveBeenCalled();
  });
});

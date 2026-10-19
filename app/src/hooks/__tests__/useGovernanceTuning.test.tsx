/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import { useGovernanceTuning } from "../useGovernanceTuning";

jest.mock("../../lib/nebgov-env", () => ({
  readGovernorConfig: jest.fn(() => ({
    governorAddress: "CTEST123...",
    timelockAddress: "CTEST456...",
    votesAddress: "CTEST789...",
    network: "testnet",
    backendUrl: "http://localhost:3001",
  })),
}));

jest.mock("@nebgov/sdk", () => ({
  GovernanceTuningClient: jest.fn().mockImplementation(() => ({
    getLatestRecommendation: jest.fn().mockResolvedValue({
      id: 1,
      computedAt: "2024-01-01",
      currentQuorumNumerator: 50,
      recommendedQuorumNumerator: 60,
      currentProposalThreshold: 1000n,
      recommendedProposalThreshold: 1200n,
      rationale: "Test rationale",
      autoProposed: false,
      proposalId: null,
    }),
    getRecommendationHistory: jest.fn().mockResolvedValue([
      {
        id: 1,
        computedAt: "2024-01-01",
        currentQuorumNumerator: 50,
        recommendedQuorumNumerator: 60,
        currentProposalThreshold: 1000n,
        recommendedProposalThreshold: 1200n,
        rationale: "Test rationale",
        autoProposed: false,
        proposalId: null,
      },
    ]),
  })),
}));

describe("useGovernanceTuning", () => {
  it("returns initial loading state", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useGovernanceTuning();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot.loading).toBe(true);
    expect(snapshot.latest).toBe(null);
    expect(snapshot.history).toEqual([]);
    expect(snapshot.error).toBe(null);
  });

  it("fetches governance tuning data successfully", async () => {
    let snapshot: any = null;

    function Probe() {
      const state = useGovernanceTuning();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
      expect(snapshot.latest).toBeTruthy();
      expect(snapshot.latest.id).toBe(1);
      expect(snapshot.history).toHaveLength(1);
      expect(snapshot.error).toBe(null);
    });
  });

  it("handles fetch error", async () => {
    const { GovernanceTuningClient } = require("@nebgov/sdk");
    GovernanceTuningClient.mockImplementation(() => ({
      getLatestRecommendation: jest.fn().mockRejectedValue(new Error("API Error")),
      getRecommendationHistory: jest.fn().mockRejectedValue(new Error("API Error")),
    }));

    let snapshot: any = null;

    function Probe() {
      const state = useGovernanceTuning();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
      expect(snapshot.error).toBeTruthy();
    });
  });

  it("returns a refresh function", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useGovernanceTuning();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(typeof snapshot.refresh).toBe("function");
  });
});

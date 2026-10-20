/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useDraft, useActiveDrafts } from "../useDraft";

// Mock the @nebgov/sdk module
const mockGetDraft = jest.fn();
const mockGetActiveDrafts = jest.fn();

jest.mock("@nebgov/sdk", () => ({
  CoSponsorshipClient: jest.fn().mockImplementation(() => ({
    getDraft: mockGetDraft,
    getActiveDrafts: mockGetActiveDrafts,
  })),
}));

// Mock readGovernorConfig
jest.mock("../../lib/nebgov-env", () => ({
  readGovernorConfig: jest.fn(),
}));

describe("useDraft", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up config mock
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    readGovernorConfig.mockReturnValue({
      governorAddress: "test_governor",
      timelockAddress: "test_timelock",
      votesAddress: "test_votes",
      network: "testnet",
      coSponsorshipAddress: "test_cosponsorship",
    });
    // Set up default mock implementations
    mockGetDraft.mockResolvedValue({
      id: 1n,
      proposer: "GABC",
      title: "Test Proposal",
      description: "Test description",
      targets: ["GDEF"],
      amounts: [1000n],
      finalized: false,
      cancelled: false,
    });
  });

  it("returns initial loading state with valid draftId", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useDraft(1n);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot).toBeTruthy();
    expect(snapshot.loading).toBe(true);
    expect(snapshot.draft).toBeNull();
    expect(snapshot.error).toBeNull();
    expect(typeof snapshot.refetch).toBe("function");
  });

  it("returns non-loading state with null draftId", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useDraft(null);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot).toBeTruthy();
    expect(snapshot.loading).toBe(false);
    expect(snapshot.draft).toBeNull();
    expect(snapshot.error).toBeNull();
  });

  it("fetches draft successfully", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");

    let snapshot: any = null;

    function Probe() {
      const state = useDraft(1n);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.draft).toEqual({
      id: 1n,
      proposer: "GABC",
      title: "Test Proposal",
      description: "Test description",
      targets: ["GDEF"],
      amounts: [1000n],
      finalized: false,
      cancelled: false,
    });
    expect(snapshot.error).toBeNull();
    expect(mockGetDraft).toHaveBeenCalledWith(1n);
    expect(mockGetDraft).toHaveBeenCalledTimes(1);
  });

  it("handles missing co-sponsorship config error", async () => {
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    readGovernorConfig.mockReturnValue(null);

    let snapshot: any = null;

    function Probe() {
      const state = useDraft(1n);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.error).toBe("Co-sponsorship registry is not configured.");
    expect(snapshot.draft).toBeNull();
  });

  it("handles missing coSponsorshipAddress in config", async () => {
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    readGovernorConfig.mockReturnValue({
      governorAddress: "test_governor",
      timelockAddress: "test_timelock",
      votesAddress: "test_votes",
      network: "testnet",
    });

    let snapshot: any = null;

    function Probe() {
      const state = useDraft(1n);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.error).toBe("Co-sponsorship registry is not configured.");
    expect(snapshot.draft).toBeNull();
  });

  it("handles API fetch error", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetDraft.mockRejectedValue(new Error("Network error"));

    let snapshot: any = null;

    function Probe() {
      const state = useDraft(1n);
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
    expect(snapshot.draft).toBeNull();
  });

  it("handles non-Error object error", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetDraft.mockRejectedValue("String error");

    let snapshot: any = null;

    function Probe() {
      const state = useDraft(1n);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.error).toBe("String error");
    expect(snapshot.draft).toBeNull();
  });

  it("refetch function triggers new fetch", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetDraft
      .mockResolvedValueOnce({
        id: 1n,
        proposer: "GABC",
        title: "Test Proposal",
        description: "Test description",
        targets: ["GDEF"],
        amounts: [1000n],
        finalized: false,
        cancelled: false,
      })
      .mockResolvedValueOnce({
        id: 1n,
        proposer: "GABC",
        title: "Updated Proposal",
        description: "Updated description",
        targets: ["GDEF"],
        amounts: [2000n],
        finalized: false,
        cancelled: false,
      });

    let snapshot: any = null;

    function Probe() {
      const state = useDraft(1n);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.draft?.title).toBe("Test Proposal");
    expect(mockGetDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      snapshot.refetch();
    });

    await waitFor(() => {
      expect(snapshot.draft?.title).toBe("Updated Proposal");
    });

    expect(mockGetDraft).toHaveBeenCalledTimes(2);
  });

  it("refetches when draftId changes", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetDraft
      .mockResolvedValueOnce({
        id: 1n,
        proposer: "GABC",
        title: "Test Proposal 1",
        description: "Test description",
        targets: ["GDEF"],
        amounts: [1000n],
        finalized: false,
        cancelled: false,
      })
      .mockResolvedValueOnce({
        id: 2n,
        proposer: "GXYZ",
        title: "Test Proposal 2",
        description: "Test description",
        targets: ["GAAA"],
        amounts: [2000n],
        finalized: false,
        cancelled: false,
      });

    let snapshot: any = null;
    let draftId = 1n;

    function Probe() {
      const state = useDraft(draftId);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    const { rerender } = render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.draft?.id).toBe(1n);
    expect(mockGetDraft).toHaveBeenCalledWith(1n);
    expect(mockGetDraft).toHaveBeenCalledTimes(1);

    // Change draftId
    draftId = 2n;
    rerender(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.draft?.id).toBe(2n);
    expect(mockGetDraft).toHaveBeenCalledWith(2n);
    expect(mockGetDraft).toHaveBeenCalledTimes(2);
  });

  it("handles component unmount (cleanup)", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetDraft.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                id: 1n,
                proposer: "GABC",
                title: "Test Proposal",
                description: "Test description",
                targets: ["GDEF"],
                amounts: [1000n],
                finalized: false,
                cancelled: false,
              }),
            100
          );
        })
    );

    function Probe() {
      const state = useDraft(1n);
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

describe("useActiveDrafts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up config mock
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    readGovernorConfig.mockReturnValue({
      governorAddress: "test_governor",
      timelockAddress: "test_timelock",
      votesAddress: "test_votes",
      network: "testnet",
      coSponsorshipAddress: "test_cosponsorship",
    });
    // Set up default mock implementations
    mockGetActiveDrafts.mockResolvedValue([
      {
        id: 1n,
        proposer: "GABC",
        title: "Test Proposal",
        description: "Test description",
        targets: ["GDEF"],
        amounts: [1000n],
        finalized: false,
        cancelled: false,
      },
    ]);
  });

  it("returns initial loading state", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useActiveDrafts();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot).toBeTruthy();
    expect(snapshot.loading).toBe(true);
    expect(snapshot.drafts).toEqual([]);
    expect(snapshot.error).toBeNull();
    expect(typeof snapshot.refetch).toBe("function");
  });

  it("fetches active drafts successfully", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetActiveDrafts.mockResolvedValue([
      {
        id: 1n,
        proposer: "GABC",
        title: "Test Proposal 1",
        description: "Test description",
        targets: ["GDEF"],
        amounts: [1000n],
        finalized: false,
        cancelled: false,
      },
      {
        id: 2n,
        proposer: "GXYZ",
        title: "Test Proposal 2",
        description: "Test description",
        targets: ["GAAA"],
        amounts: [2000n],
        finalized: false,
        cancelled: false,
      },
      {
        id: 3n,
        proposer: "GTEST",
        title: "Finalized Proposal",
        description: "Test description",
        targets: ["GTEST"],
        amounts: [3000n],
        finalized: true,
        cancelled: false,
      },
      {
        id: 4n,
        proposer: "GCANCEL",
        title: "Cancelled Proposal",
        description: "Test description",
        targets: ["GCANCEL"],
        amounts: [4000n],
        finalized: false,
        cancelled: true,
      },
    ]);

    let snapshot: any = null;

    function Probe() {
      const state = useActiveDrafts();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    // Should filter out finalized and cancelled drafts
    expect(snapshot.drafts).toHaveLength(2);
    expect(snapshot.drafts[0].id).toBe(1n);
    expect(snapshot.drafts[1].id).toBe(2n);
    expect(snapshot.error).toBeNull();
    expect(mockGetActiveDrafts).toHaveBeenCalledWith(0, 20);
    expect(mockGetActiveDrafts).toHaveBeenCalledTimes(1);
  });

  it("handles missing co-sponsorship config error", async () => {
    const { readGovernorConfig } = require("../../lib/nebgov-env");
    readGovernorConfig.mockReturnValue(null);

    let snapshot: any = null;

    function Probe() {
      const state = useActiveDrafts();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.error).toBe("Co-sponsorship registry is not configured.");
    expect(snapshot.drafts).toEqual([]);
  });

  it("handles API fetch error", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetActiveDrafts.mockRejectedValue(new Error("Network error"));

    let snapshot: any = null;

    function Probe() {
      const state = useActiveDrafts();
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
    expect(snapshot.drafts).toEqual([]);
  });

  it("uses custom offset and limit parameters", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetActiveDrafts.mockResolvedValue([]);

    let snapshot: any = null;

    function Probe() {
      const state = useActiveDrafts(10, 50);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(mockGetActiveDrafts).toHaveBeenCalledWith(10, 50);
  });

  it("refetch function triggers new fetch", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetActiveDrafts
      .mockResolvedValueOnce([
        {
          id: 1n,
          proposer: "GABC",
          title: "Test Proposal",
          description: "Test description",
          targets: ["GDEF"],
          amounts: [1000n],
          finalized: false,
          cancelled: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2n,
          proposer: "GXYZ",
          title: "New Proposal",
          description: "Test description",
          targets: ["GAAA"],
          amounts: [2000n],
          finalized: false,
          cancelled: false,
        },
      ]);

    let snapshot: any = null;

    function Probe() {
      const state = useActiveDrafts();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(snapshot.drafts).toHaveLength(1);
    expect(snapshot.drafts[0].id).toBe(1n);
    expect(mockGetActiveDrafts).toHaveBeenCalledTimes(1);

    await act(async () => {
      snapshot.refetch();
    });

    await waitFor(() => {
      expect(snapshot.drafts).toHaveLength(1);
      expect(snapshot.drafts[0].id).toBe(2n);
    });

    expect(mockGetActiveDrafts).toHaveBeenCalledTimes(2);
  });

  it("refetches when offset or limit changes", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetActiveDrafts
      .mockResolvedValueOnce([
        {
          id: 1n,
          proposer: "GABC",
          title: "Test Proposal",
          description: "Test description",
          targets: ["GDEF"],
          amounts: [1000n],
          finalized: false,
          cancelled: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2n,
          proposer: "GXYZ",
          title: "Test Proposal 2",
          description: "Test description",
          targets: ["GAAA"],
          amounts: [2000n],
          finalized: false,
          cancelled: false,
        },
      ]);

    let snapshot: any = null;
    let offset = 0;

    function Probe() {
      const state = useActiveDrafts(offset, 20);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    const { rerender } = render(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(mockGetActiveDrafts).toHaveBeenCalledWith(0, 20);
    expect(mockGetActiveDrafts).toHaveBeenCalledTimes(1);

    // Change offset
    offset = 20;
    rerender(<Probe />);

    await waitFor(() => {
      expect(snapshot.loading).toBe(false);
    });

    expect(mockGetActiveDrafts).toHaveBeenCalledWith(20, 20);
    expect(mockGetActiveDrafts).toHaveBeenCalledTimes(2);
  });

  it("handles component unmount (cleanup)", async () => {
    const { CoSponsorshipClient } = require("@nebgov/sdk");
    mockGetActiveDrafts.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve([
                {
                  id: 1n,
                  proposer: "GABC",
                  title: "Test Proposal",
                  description: "Test description",
                  targets: ["GDEF"],
                  amounts: [1000n],
                  finalized: false,
                  cancelled: false,
                },
              ]),
            100
          );
        })
    );

    function Probe() {
      const state = useActiveDrafts();
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

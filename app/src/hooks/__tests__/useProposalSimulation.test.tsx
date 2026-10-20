/**
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import type { SimulationResult } from "@nebgov/sdk";
import { useProposalSimulation } from "../useProposalSimulation";

const previewDraftMock = jest.fn();
const simulateProposalMock = jest.fn();
const ProposalSimulationClientMock = jest.fn();

jest.mock("@nebgov/sdk", () => ({
  ProposalSimulationClient: function (...args: unknown[]) {
    ProposalSimulationClientMock(...args);
    return {
      previewDraft: (...a: unknown[]) => previewDraftMock(...a),
      simulateProposal: (...a: unknown[]) => simulateProposalMock(...a),
    };
  },
}));

const okResult: SimulationResult = {
  target: "CTARGET1",
  fnName: "transfer",
  success: true,
  decodedSummary: "Transfer 10 tokens",
};

const revertResult: SimulationResult = {
  target: "CTARGET2",
  fnName: "set_quorum",
  success: false,
  decodedSummary: "Set quorum",
  revertReason: "Unauthorized",
};

describe("useProposalSimulation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("starts idle with no results, error, or reverts", () => {
    const { result } = renderHook(() => useProposalSimulation());

    expect(result.current.results).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.anyActionWouldRevert).toBe(false);
    expect(ProposalSimulationClientMock).not.toHaveBeenCalled();
  });

  it("previewDraft stores results and forwards the draft to the client", async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/";
    previewDraftMock.mockResolvedValue([okResult]);
    const calldatas = [new Uint8Array([1, 2, 3])];
    const { result } = renderHook(() => useProposalSimulation());

    let returned: SimulationResult[] | null = null;
    await act(async () => {
      returned = await result.current.previewDraft(["CTARGET1"], ["transfer"], calldatas, "hash");
    });

    expect(ProposalSimulationClientMock).toHaveBeenCalledWith({
      governorAddress: "CTEST123...",
      timelockAddress: "CTEST456...",
      votesAddress: "CTEST789...",
      network: "testnet",
      backendUrl: "https://api.example.com",
    });
    expect(previewDraftMock).toHaveBeenCalledWith(["CTARGET1"], ["transfer"], calldatas, "hash");
    expect(returned).toEqual([okResult]);
    expect(result.current.results).toEqual([okResult]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.anyActionWouldRevert).toBe(false);
  });

  it("simulateProposal stores results and flags actions that would revert", async () => {
    simulateProposalMock.mockResolvedValue([okResult, revertResult]);
    const { result } = renderHook(() => useProposalSimulation());

    await act(async () => {
      await result.current.simulateProposal(42);
    });

    expect(simulateProposalMock).toHaveBeenCalledWith(42);
    expect(result.current.results).toEqual([okResult, revertResult]);
    expect(result.current.anyActionWouldRevert).toBe(true);
  });

  it("reports loading while a simulation is in flight", async () => {
    let resolve!: (value: SimulationResult[]) => void;
    simulateProposalMock.mockReturnValue(
      new Promise<SimulationResult[]>((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(() => useProposalSimulation());

    let pending!: Promise<SimulationResult[] | null>;
    act(() => {
      pending = result.current.simulateProposal(1);
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolve([okResult]);
      await pending;
    });
    expect(result.current.loading).toBe(false);
  });

  it("sets the error message and clears results when the client rejects", async () => {
    previewDraftMock.mockResolvedValueOnce([okResult]);
    simulateProposalMock.mockRejectedValueOnce(new Error("backend unavailable"));
    const { result } = renderHook(() => useProposalSimulation());

    await act(async () => {
      await result.current.previewDraft(["CTARGET1"], ["transfer"], [new Uint8Array()]);
    });
    expect(result.current.results).toEqual([okResult]);

    let returned: SimulationResult[] | null = [];
    await act(async () => {
      returned = await result.current.simulateProposal(7);
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe("backend unavailable");
    expect(result.current.results).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.anyActionWouldRevert).toBe(false);
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    previewDraftMock.mockRejectedValue("boom");
    const { result } = renderHook(() => useProposalSimulation());

    await act(async () => {
      await result.current.previewDraft([], [], []);
    });

    expect(result.current.error).toBe("Failed to simulate proposal");
  });

  it("errors without calling the client when required env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;
    const { result } = renderHook(() => useProposalSimulation());

    await act(async () => {
      await result.current.simulateProposal(1);
    });

    expect(result.current.error).toBe(
      "Missing required environment variables for ProposalSimulationClient",
    );
    expect(ProposalSimulationClientMock).not.toHaveBeenCalled();
    expect(simulateProposalMock).not.toHaveBeenCalled();
  });

  it("clears a previous error when a new simulation starts", async () => {
    simulateProposalMock.mockRejectedValueOnce(new Error("first failed"));
    simulateProposalMock.mockResolvedValueOnce([okResult]);
    const { result } = renderHook(() => useProposalSimulation());

    await act(async () => {
      await result.current.simulateProposal(1);
    });
    expect(result.current.error).toBe("first failed");

    await act(async () => {
      await result.current.simulateProposal(1);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.results).toEqual([okResult]);
  });

  it("reset clears results and error", async () => {
    simulateProposalMock.mockResolvedValue([revertResult]);
    const { result } = renderHook(() => useProposalSimulation());

    await act(async () => {
      await result.current.simulateProposal(3);
    });
    expect(result.current.anyActionWouldRevert).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.results).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.anyActionWouldRevert).toBe(false);
  });
});

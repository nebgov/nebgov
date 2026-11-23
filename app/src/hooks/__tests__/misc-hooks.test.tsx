/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { useTheme } from "../useTheme";
import { getTheme, setTheme, initializeTheme } from "../../lib/theme";
import { useTreasuryStrategies } from "../useTreasuryStrategies";
import { useVoteEscrow } from "../useVoteEscrow";

const mockTreasuryClient = {
  listStrategies: jest.fn(),
  getStrategy: jest.fn(),
};

const mockVoteEscrowClient = {
  getLock: jest.fn(),
  getVotingPower: jest.fn(),
  getEscrowStats: jest.fn(),
};

const mockReadGovernorConfig = jest.fn();
const mockReadIndexerUrl = jest.fn();

jest.mock("@nebgov/sdk", () => ({
  TreasuryStrategiesClient: jest.fn(() => mockTreasuryClient),
  VoteEscrowClient: jest.fn(() => mockVoteEscrowClient),
}));

jest.mock("../../lib/nebgov-env", () => ({
  readGovernorConfig: (...args: any[]) => mockReadGovernorConfig(...args),
  readIndexerUrl: (...args: any[]) => mockReadIndexerUrl(...args),
}));
jest.mock("@/lib/nebgov-env", () => ({
  readGovernorConfig: (...args: any[]) => mockReadGovernorConfig(...args),
  readIndexerUrl: (...args: any[]) => mockReadIndexerUrl(...args),
}), { virtual: true });

const originalMatchMedia = window.matchMedia;

function mockSystemPreference(dark: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: dark,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as any;
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    mockSystemPreference(false);
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("uses the theme saved in localStorage", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("falls back to the system preference when nothing is saved", () => {
    mockSystemPreference(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("defaults to light when localStorage throws", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
    (Storage.prototype.getItem as jest.Mock).mockRestore?.();
  });

  it("updates the document class and persists the theme, tolerating localStorage errors", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    jest.restoreAllMocks();
  });
});

describe("lib/theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    mockSystemPreference(false);
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("getTheme returns 'system' when nothing is stored", () => {
    expect(getTheme()).toBe("system");
  });

  it("getTheme returns the stored theme", () => {
    localStorage.setItem("theme", "dark");
    expect(getTheme()).toBe("dark");
  });

  it("setTheme toggles the dark class and persists the choice", () => {
    setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");

    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("setTheme 'system' follows the system preference", () => {
    mockSystemPreference(true);
    setTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("system");

    mockSystemPreference(false);
    setTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("initializeTheme applies the stored theme to the document", () => {
    localStorage.setItem("theme", "dark");
    initializeTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("useTreasuryStrategies", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadGovernorConfig.mockReturnValue({
      governorAddress: "CGOV",
      timelockAddress: "CTIME",
      votesAddress: "CVOTES",
      treasuryStrategiesAddress: "CSTRAT",
      network: "testnet",
    });
    mockReadIndexerUrl.mockReturnValue("http://indexer.test");
    mockTreasuryClient.listStrategies.mockResolvedValue([]);
  });

  it("reports an unconfigured contract without calling the client", async () => {
    mockReadGovernorConfig.mockReturnValue(null);
    const { result } = renderHook(() => useTreasuryStrategies("TOKEN"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Treasury strategies contract is not configured.");
    expect(result.current.strategies).toEqual([]);
    expect(mockTreasuryClient.listStrategies).not.toHaveBeenCalled();
  });

  it("merges indexer rows with on-chain strategy config", async () => {
    mockTreasuryClient.listStrategies.mockResolvedValue([
      { strategyId: "S1", token: "TOKEN", active: true },
    ]);
    mockTreasuryClient.getStrategy.mockResolvedValue({
      maxAllocationBps: 500,
      withdrawalCooldownLedgers: 100,
    });

    const { result } = renderHook(() => useTreasuryStrategies("TOKEN"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.strategies).toEqual([
      {
        strategyId: "S1",
        token: "TOKEN",
        active: true,
        maxAllocationBps: 500,
        withdrawalCooldownLedgers: 100,
      },
    ]);
    expect(mockTreasuryClient.listStrategies).toHaveBeenCalledWith({
      token: "TOKEN",
      limit: 100,
    });
  });

  it("returns an empty list when there are no strategies", async () => {
    const { result } = renderHook(() => useTreasuryStrategies("TOKEN"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.strategies).toEqual([]);
  });

  it("exposes load errors", async () => {
    mockTreasuryClient.listStrategies.mockRejectedValue(new Error("indexer down"));
    const { result } = renderHook(() => useTreasuryStrategies("TOKEN"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("indexer down");
    expect(result.current.strategies).toEqual([]);
  });
});

describe("useVoteEscrow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_VOTE_ESCROW_ADDRESS = "CVEADDRESS";
    mockReadGovernorConfig.mockReturnValue({
      governorAddress: "CGOV",
      timelockAddress: "CTIME",
      votesAddress: "CVOTES",
      network: "testnet",
    });
    mockVoteEscrowClient.getLock.mockResolvedValue({ amount: 100n, endTime: 200n });
    mockVoteEscrowClient.getVotingPower.mockResolvedValue(42n);
    mockVoteEscrowClient.getEscrowStats.mockResolvedValue({ totalLocked: 1000n });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_VOTE_ESCROW_ADDRESS;
  });

  it("does nothing without an address", async () => {
    const { result } = renderHook(() => useVoteEscrow(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lock).toBeNull();
    expect(result.current.votingPower).toBe(0n);
    expect(result.current.stats).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockVoteEscrowClient.getLock).not.toHaveBeenCalled();
  });

  it("errors when the vote escrow contract is not configured", async () => {
    delete process.env.NEXT_PUBLIC_VOTE_ESCROW_ADDRESS;
    const { result } = renderHook(() => useVoteEscrow("GADDRESS"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("NEXT_PUBLIC_VOTE_ESCROW_ADDRESS not configured");
  });

  it("loads lock, voting power and stats", async () => {
    const { result } = renderHook(() => useVoteEscrow("GADDRESS"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.lock).toEqual({ amount: 100n, endTime: 200n });
    expect(result.current.votingPower).toBe(42n);
    expect(result.current.stats).toEqual({ totalLocked: 1000n });
    expect(mockVoteEscrowClient.getLock).toHaveBeenCalledWith("GADDRESS");
    expect(mockVoteEscrowClient.getVotingPower).toHaveBeenCalledWith("GADDRESS");
    expect(mockVoteEscrowClient.getEscrowStats).toHaveBeenCalled();
  });

  it("exposes load errors", async () => {
    mockVoteEscrowClient.getLock.mockRejectedValue(new Error("rpc offline"));
    const { result } = renderHook(() => useVoteEscrow("GADDRESS"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("rpc offline");
    expect(result.current.lock).toBeNull();
  });
});

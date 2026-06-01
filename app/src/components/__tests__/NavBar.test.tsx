import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { axe, toHaveNoViolations } from "jest-axe";
import { NavBar } from "../NavBar";

expect.extend(toHaveNoViolations);

// Mock Next Navigation
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock Next Link
jest.mock("next/link", () => {
  return ({ children, href }: any) => <a href={href}>{children}</a>;
});

// Mock next-intl translations
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock Wallet Context
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
let mockWallet = {
  address: "GBFUUXA...RVRE2DT",
  publicKey: "GBFUUXATVOGXGD4KS3I423QFZSPE4ZFOQ3TCJVWFUYSIPULXIRVRE2DT",
  isConnected: false,
  isConnecting: false,
  connect: mockConnect,
  disconnect: mockDisconnect,
};
jest.mock("../../lib/wallet-context", () => ({
  useWallet: () => mockWallet,
}));

// Mock Theme hook
const mockSetTheme = jest.fn();
let mockTheme = {
  theme: "dark",
  setTheme: mockSetTheme,
};
jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => mockTheme,
}));

// Mock Governance Balance
jest.mock("../../lib/use-governance-balance", () => ({
  useGovernanceBalance: () => ({
    loading: false,
    baseVotes: 12500n,
    votingPower: 12500n,
    delegatee: null,
  }),
}));

// Mock Notifications
jest.mock("../../lib/governance-notifications", () => ({
  loadNotificationHistory: () => [
    { id: "1", title: "Proposal Active", read: false },
    { id: "2", title: "New Proposal", read: true },
  ],
}));

describe("NavBar Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWallet.isConnected = false;
    mockWallet.isConnecting = false;
    mockTheme.theme = "dark";
  });

  it("shows Connect Wallet button when disconnected", () => {
    render(<NavBar />);
    const connectButtons = screen.getAllByText("Connect Wallet");
    expect(connectButtons.length).toBeGreaterThan(0);
    expect(screen.queryByText("GBFUUXA...RVRE2DT")).not.toBeInTheDocument();
  });

  it("calls connect when Connect Wallet is clicked", () => {
    render(<NavBar />);
    const connectButton = screen.getAllByText("Connect Wallet")[0];
    fireEvent.click(connectButton);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("shows Connecting... state when isConnecting is true", () => {
    mockWallet.isConnecting = true;
    render(<NavBar />);
    const connectingButtons = screen.getAllByText("Connecting…");
    expect(connectingButtons.length).toBeGreaterThan(0);
  });

  it("shows truncated address and governance balance when connected", () => {
    mockWallet.isConnected = true;
    render(<NavBar />);
    expect(screen.getByText("GBFUUXA...RVRE2DT")).toBeInTheDocument();
    // 12500 gets compact formatted by formatGovernanceAmount as "12.5K GOV"
    expect(screen.getByText("12.5K GOV")).toBeInTheDocument();
  });

  it("opens profile dropdown and copy/profile/disconnect items when clicked", () => {
    mockWallet.isConnected = true;
    render(<NavBar />);
    
    // Toggle profile menu
    const dropdownButton = screen.getByRole("button", { name: /GBFUUXA/ });
    expect(dropdownButton).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(dropdownButton);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Copy address")).toBeInTheDocument();
    expect(screen.getByText("My Profile")).toBeInTheDocument();
    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });

  it("calls disconnect when disconnect button is clicked", () => {
    mockWallet.isConnected = true;
    render(<NavBar />);
    
    const dropdownButton = screen.getByRole("button", { name: /GBFUUXA/ });
    fireEvent.click(dropdownButton);
    
    const disconnectButton = screen.getByText("Disconnect");
    fireEvent.click(disconnectButton);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("closes profile dropdown when Escape key is pressed", () => {
    mockWallet.isConnected = true;
    render(<NavBar />);
    
    const dropdownButton = screen.getByRole("button", { name: /GBFUUXA/ });
    fireEvent.click(dropdownButton);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("toggles dark/light theme when theme button is clicked", () => {
    render(<NavBar />);
    const themeBtn = screen.getByRole("button", { name: /Switch to/i });
    fireEvent.click(themeBtn);
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("opens mobile drawer when hamburger button is clicked", () => {
    render(<NavBar />);
    const menuBtn = screen.getByRole("button", { name: /Open menu/i });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(menuBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Close menu/i })[0]).toBeInTheDocument();
  });

  it("performs jest-axe accessibility audit successfully", async () => {
    const { container } = render(<NavBar />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

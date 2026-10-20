/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationBell } from "../NotificationBell";

jest.mock("../hooks/useNotifications", () => ({
  useNotifications: jest.fn(),
}));

jest.mock("../lib/wallet-context", () => ({
  useWallet: jest.fn(),
}));

jest.mock("next/link", () => {
  return ({ children, href }: any) => <a href={href}>{children}</a>;
});

import { useNotifications } from "../hooks/useNotifications";
import { useWallet } from "../lib/wallet-context";

const mockUseNotifications = useNotifications as jest.MockedFunction<typeof useNotifications>;
const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;

describe("NotificationBell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not render when wallet is not connected", () => {
    mockUseWallet.mockReturnValue({
      isConnected: false,
    } as any);

    mockUseNotifications.mockReturnValue({
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    const { container } = render(<NotificationBell />);
    expect(container.firstChild).toBeNull();
  });

  it("renders bell icon when wallet is connected", () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
    } as any);

    mockUseNotifications.mockReturnValue({
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationBell />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("displays unread count badge when there are unread notifications", () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
    } as any);

    mockUseNotifications.mockReturnValue({
      unreadCount: 5,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationBell />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("displays 99+ when unread count exceeds 99", () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
    } as any);

    mockUseNotifications.mockReturnValue({
      unreadCount: 150,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationBell />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("opens notification dropdown when button is clicked", () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
    } as any);

    mockUseNotifications.mockReturnValue({
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationBell />);
    const button = screen.getByRole("button", { name: "Notifications" });
    
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("closes dropdown when button is clicked again", () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
    } as any);

    mockUseNotifications.mockReturnValue({
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationBell />);
    const button = screen.getByRole("button", { name: "Notifications" });
    
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("displays unread notifications in dropdown", () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
    } as any);

    const mockNotifications = [
      {
        id: "1",
        title: "Proposal created",
        body: "A new proposal has been created",
        read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: "2",
        title: "Vote cast",
        body: "Your vote was recorded",
        read: false,
        created_at: new Date().toISOString(),
      },
    ];

    mockUseNotifications.mockReturnValue({
      unreadCount: 2,
      notifications: mockNotifications,
      markRead: jest.fn(),
    } as any);

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    
    expect(screen.getByText("Proposal created")).toBeInTheDocument();
    expect(screen.getByText("Vote cast")).toBeInTheDocument();
  });

  it("displays 'all caught up' message when no unread notifications", () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
    } as any);

    mockUseNotifications.mockReturnValue({
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });

  it("calls markRead when notification is clicked", () => {
    const markRead = jest.fn();
    mockUseWallet.mockReturnValue({
      isConnected: true,
    } as any);

    mockUseNotifications.mockReturnValue({
      unreadCount: 1,
      notifications: [
        {
          id: "1",
          title: "Test notification",
          body: "Test body",
          read: false,
          created_at: new Date().toISOString(),
        },
      ],
      markRead,
    } as any);

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    fireEvent.click(screen.getByText("Test notification"));
    
    expect(markRead).toHaveBeenCalledWith("1");
  });

  it("displays view all notifications link", () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
    } as any);

    mockUseNotifications.mockReturnValue({
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    
    const viewAllLink = screen.getByRole("link", { name: "View all" });
    expect(viewAllLink).toHaveAttribute("href", "/notifications");
  });

  it("closes dropdown when clicking outside", () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
    } as any);

    mockUseNotifications.mockReturnValue({
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationBell />);
    const button = screen.getByRole("button", { name: "Notifications" });
    
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    
    // Click the backdrop
    const backdrop = screen.getByRole("generic", { hidden: true });
    fireEvent.click(backdrop);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});

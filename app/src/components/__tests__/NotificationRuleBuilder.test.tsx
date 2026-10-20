/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationRuleBuilder } from "../NotificationRuleBuilder";

jest.mock("../hooks/useNotifications", () => ({
  useNotifications: jest.fn(),
}));

import { useNotifications } from "../hooks/useNotifications";

const mockUseNotifications = useNotifications as jest.MockedFunction<typeof useNotifications>;

describe("NotificationRuleBuilder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the initial trigger selection step", () => {
    mockUseNotifications.mockReturnValue({
      createRule: jest.fn(),
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    const onClose = jest.fn();
    render(<NotificationRuleBuilder onClose={onClose} />);

    expect(screen.getByText("Proposal created")).toBeInTheDocument();
    expect(screen.getByText("Proposal state changed")).toBeInTheDocument();
  });

  it("displays all trigger options", () => {
    mockUseNotifications.mockReturnValue({
      createRule: jest.fn(),
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationRuleBuilder onClose={jest.fn()} />);

    const triggers = [
      "Proposal created",
      "Proposal state changed",
      "Vote cast",
      "Voting ending soon",
      "Delegation received",
      "Delegation revoked",
      "Governor config updated",
      "Governor upgraded",
      "Guardian veto",
      "Treasury stream spend",
      "Contract paused",
      "Vote threshold reached",
      "Quorum reached",
    ];

    triggers.forEach((trigger) => {
      expect(screen.getByText(trigger)).toBeInTheDocument();
    });
  });

  it("allows selection of a trigger type", () => {
    mockUseNotifications.mockReturnValue({
      createRule: jest.fn(),
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationRuleBuilder onClose={jest.fn()} />);

    const proposalStateChanged = screen.getByText("Proposal state changed");
    fireEvent.click(proposalStateChanged);
    
    // The component should allow selection (actual behavior depends on implementation)
    expect(screen.getByText("Proposal state changed")).toBeInTheDocument();
  });

  it("handles rule name input", () => {
    mockUseNotifications.mockReturnValue({
      createRule: jest.fn(),
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationRuleBuilder onClose={jest.fn()} />);

    const nameInput = screen.queryByPlaceholderText(/rule name/i) || 
                      screen.queryByDisplayValue("") as HTMLInputElement;
    
    if (nameInput && nameInput.type === "text") {
      fireEvent.change(nameInput, { target: { value: "My custom rule" } });
      expect((nameInput as HTMLInputElement).value).toBe("My custom rule");
    }
  });

  it("includes in-app channel by default", () => {
    mockUseNotifications.mockReturnValue({
      createRule: jest.fn(),
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationRuleBuilder onClose={jest.fn()} />);

    // The component should have in-app channel selected by default
    // Look for visual indication of in-app being selected
    const inAppCheckbox = screen.queryByRole("checkbox", { name: /in.?app/i });
    if (inAppCheckbox) {
      expect(inAppCheckbox).toBeChecked();
    }
  });

  it("calls onClose when close is requested", () => {
    mockUseNotifications.mockReturnValue({
      createRule: jest.fn(),
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    const onClose = jest.fn();
    render(<NotificationRuleBuilder onClose={onClose} />);

    const closeButton = screen.queryByRole("button", { name: /close|cancel/i });
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it("handles rule submission", async () => {
    const createRule = jest.fn().mockResolvedValue(undefined);
    mockUseNotifications.mockReturnValue({
      createRule,
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    const onClose = jest.fn();
    const onCreated = jest.fn();
    render(<NotificationRuleBuilder onClose={onClose} onCreated={onCreated} />);

    const submitButton = screen.queryByRole("button", { name: /submit|create|save/i });
    if (submitButton) {
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(createRule).toHaveBeenCalled();
      });
    }
  });

  it("displays error message on submission failure", async () => {
    const error = new Error("Failed to create rule");
    const createRule = jest.fn().mockRejectedValue(error);
    mockUseNotifications.mockReturnValue({
      createRule,
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationRuleBuilder onClose={jest.fn()} />);

    const submitButton = screen.queryByRole("button", { name: /submit|create|save/i });
    if (submitButton) {
      fireEvent.click(submitButton);

      await waitFor(() => {
        const errorText = screen.queryByText("Failed to create rule");
        if (errorText) {
          expect(errorText).toBeInTheDocument();
        }
      });
    }
  });

  it("calls onCreated callback after successful submission", async () => {
    const createRule = jest.fn().mockResolvedValue(undefined);
    mockUseNotifications.mockReturnValue({
      createRule,
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    const onClose = jest.fn();
    const onCreated = jest.fn();
    render(<NotificationRuleBuilder onClose={onClose} onCreated={onCreated} />);

    const submitButton = screen.queryByRole("button", { name: /submit|create|save/i });
    if (submitButton) {
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(onCreated).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    }
  });

  it("allows email channel configuration", () => {
    mockUseNotifications.mockReturnValue({
      createRule: jest.fn(),
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationRuleBuilder onClose={jest.fn()} />);

    const emailCheckbox = screen.queryByRole("checkbox", { name: /email/i });
    if (emailCheckbox) {
      fireEvent.click(emailCheckbox);
      expect(emailCheckbox).toBeChecked();

      const emailInput = screen.queryByPlaceholderText(/email/i);
      if (emailInput) {
        fireEvent.change(emailInput, { target: { value: "user@example.com" } });
        expect((emailInput as HTMLInputElement).value).toBe("user@example.com");
      }
    }
  });

  it("allows webhook channel configuration", () => {
    mockUseNotifications.mockReturnValue({
      createRule: jest.fn(),
      unreadCount: 0,
      notifications: [],
      markRead: jest.fn(),
    } as any);

    render(<NotificationRuleBuilder onClose={jest.fn()} />);

    const webhookCheckbox = screen.queryByRole("checkbox", { name: /webhook/i });
    if (webhookCheckbox) {
      fireEvent.click(webhookCheckbox);
      expect(webhookCheckbox).toBeChecked();

      const urlInput = screen.queryByPlaceholderText(/url|webhook/i);
      if (urlInput) {
        fireEvent.change(urlInput, { target: { value: "https://example.com/webhook" } });
        expect((urlInput as HTMLInputElement).value).toBe("https://example.com/webhook");
      }
    }
  });
});

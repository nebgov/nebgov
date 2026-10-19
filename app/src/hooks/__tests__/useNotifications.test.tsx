/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useNotifications } from "../useNotifications";

const backendFetchMock = jest.fn();

jest.mock("../../lib/backend", () => ({
  backendFetch: (...args: any[]) => backendFetchMock(...args),
}));

jest.mock("../../lib/wallet-context", () => ({
  useWallet: jest.fn(() => ({ isConnected: true })),
}));

describe("useNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns initial state", () => {
    let snapshot: any = null;

    function Probe() {
      const state = useNotifications();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot.unreadCount).toBe(0);
    expect(snapshot.notifications).toEqual([]);
    expect(snapshot.rules).toEqual([]);
    expect(typeof snapshot.markRead).toBe("function");
    expect(typeof snapshot.markAllRead).toBe("function");
    expect(typeof snapshot.createRule).toBe("function");
    expect(typeof snapshot.updateRule).toBe("function");
    expect(typeof snapshot.deleteRule).toBe("function");
    expect(typeof snapshot.testRule).toBe("function");
  });

  it("fetches inbox and rules when connected", async () => {
    backendFetchMock
      .mockResolvedValueOnce({
        data: [
          { id: 1, rule_id: null, title: "Test", body: "Body", action_url: null, read: false, created_at: "2024-01-01" },
        ],
        meta: { total: 1, unread: 1, limit: 20, offset: 0 },
      })
      .mockResolvedValueOnce([
        { id: 1, user_id: 1, name: "Rule 1", trigger_type: "proposal_created", trigger_config: {}, channels: [], enabled: true, cooldown_seconds: 300, last_triggered_at: null, trigger_count: 0, created_at: "2024-01-01", updated_at: "2024-01-01" },
      ]);

    let snapshot: any = null;

    function Probe() {
      const state = useNotifications();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot.notifications).toHaveLength(1);
      expect(snapshot.rules).toHaveLength(1);
      expect(snapshot.unreadCount).toBe(1);
    });

    expect(backendFetchMock).toHaveBeenCalledWith("/notifications/inbox?limit=20", { auth: true });
    expect(backendFetchMock).toHaveBeenCalledWith("/notifications/rules", { auth: true });
  });

  it("does not fetch when not connected", () => {
    const { useWallet } = require("../../lib/wallet-context");
    useWallet.mockReturnValue({ isConnected: false });

    let snapshot: any = null;

    function Probe() {
      const state = useNotifications();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    expect(snapshot.notifications).toEqual([]);
    expect(snapshot.rules).toEqual([]);
    expect(snapshot.unreadCount).toBe(0);
    expect(backendFetchMock).not.toHaveBeenCalled();
  });

  it("marks notification as read", async () => {
    backendFetchMock.mockResolvedValue({
      data: [],
      meta: { total: 0, unread: 0, limit: 20, offset: 0 },
    });

    let snapshot: any = null;

    function Probe() {
      const state = useNotifications();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot).toBeTruthy();
    });

    await act(async () => {
      await snapshot.markRead(1);
    });

    expect(backendFetchMock).toHaveBeenCalledWith("/notifications/inbox/1/read", { method: "PUT", auth: true });
  });

  it("marks all notifications as read", async () => {
    backendFetchMock.mockResolvedValue({
      data: [],
      meta: { total: 0, unread: 0, limit: 20, offset: 0 },
    });

    let snapshot: any = null;

    function Probe() {
      const state = useNotifications();
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot).toBeTruthy();
    });

    await act(async () => {
      await snapshot.markAllRead();
    });

    expect(backendFetchMock).toHaveBeenCalledWith("/notifications/inbox/read-all", { method: "PUT", auth: true });
  });

  it("creates a rule", async () => {
    backendFetchMock
      .mockResolvedValueOnce({
        data: [],
        meta: { total: 0, unread: 0, limit: 20, offset: 0 },
      })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 1, user_id: 1, name: "New Rule", trigger_type: "proposal_created", trigger_config: {}, channels: [], enabled: true, cooldown_seconds: 300, last_triggered_at: null, trigger_count: 0, created_at: "2024-01-01", updated_at: "2024-01-01" },
      ]);

    let snapshot: any = null;

    function Probe() {
      const state = useNotifications();
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
      await snapshot.createRule({
        name: "New Rule",
        trigger_type: "proposal_created",
        channels: [],
      });
    });

    await waitFor(() => {
      expect(backendFetchMock).toHaveBeenCalledWith("/notifications/rules", {
        method: "POST",
        body: JSON.stringify({
          name: "New Rule",
          trigger_type: "proposal_created",
          channels: [],
        }),
        auth: true,
      });
    });
  });

  it("updates a rule", async () => {
    backendFetchMock
      .mockResolvedValueOnce({
        data: [],
        meta: { total: 0, unread: 0, limit: 20, offset: 0 },
      })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    let snapshot: any = null;

    function Probe() {
      const state = useNotifications();
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
      await snapshot.updateRule(1, { enabled: false });
    });

    await waitFor(() => {
      expect(backendFetchMock).toHaveBeenCalledWith("/notifications/rules/1", {
        method: "PUT",
        body: JSON.stringify({ enabled: false }),
        auth: true,
      });
    });
  });

  it("deletes a rule", async () => {
    backendFetchMock
      .mockResolvedValueOnce({
        data: [],
        meta: { total: 0, unread: 0, limit: 20, offset: 0 },
      })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    let snapshot: any = null;

    function Probe() {
      const state = useNotifications();
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
      await snapshot.deleteRule(1);
    });

    await waitFor(() => {
      expect(backendFetchMock).toHaveBeenCalledWith("/notifications/rules/1", {
        method: "DELETE",
        auth: true,
      });
    });
  });

  it("tests a rule", async () => {
    backendFetchMock
      .mockResolvedValueOnce({
        data: [],
        meta: { total: 0, unread: 0, limit: 20, offset: 0 },
      })
      .mockResolvedValueOnce([]);

    let snapshot: any = null;

    function Probe() {
      const state = useNotifications();
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
      await snapshot.testRule(1);
    });

    expect(backendFetchMock).toHaveBeenCalledWith("/notifications/rules/1/test", {
      method: "POST",
      auth: true,
    });
  });

});

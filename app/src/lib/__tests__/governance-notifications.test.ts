import {
  DEFAULT_NOTIFICATION_TOGGLES,
  LS_NOTIFY_HISTORY,
  LS_NOTIFY_TOGGLES,
  LS_PROPOSAL_META,
  appendNotificationHistory,
  loadNotificationHistory,
  loadNotificationToggles,
  loadProposalMeta,
  markAllNotificationsRead,
  mergeProposalMetaEntry,
  saveNotificationToggles,
  syncNotificationsFromBackend,
  unreadCount,
} from "../governance-notifications";
import { backendFetch, getAuthToken } from "../backend";

jest.mock("../backend", () => ({
  backendFetch: jest.fn(),
  getAuthToken: jest.fn(),
}));

const mockBackendFetch = backendFetch as unknown as jest.Mock;
const mockGetAuthToken = getAuthToken as unknown as jest.Mock;

const listeners: Array<[string, EventListener]> = [];

function listenFor(eventName: string): jest.Mock {
  const listener = jest.fn();
  window.addEventListener(eventName, listener);
  listeners.push([eventName, listener]);
  return listener;
}

describe("governance-notifications", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockGetAuthToken.mockReturnValue(null);
    mockBackendFetch.mockResolvedValue({});
  });

  afterEach(() => {
    for (const [eventName, listener] of listeners.splice(0)) {
      window.removeEventListener(eventName, listener as EventListener);
    }
  });

  describe("notification toggles", () => {
    it("enables every toggle when nothing is stored", () => {
      expect(loadNotificationToggles()).toEqual(DEFAULT_NOTIFICATION_TOGGLES);
    });

    it("merges a partial stored object over the defaults", () => {
      localStorage.setItem(LS_NOTIFY_TOGGLES, JSON.stringify({ executed: false }));
      expect(loadNotificationToggles()).toEqual({
        ...DEFAULT_NOTIFICATION_TOGGLES,
        executed: false,
      });
    });

    it("falls back to the defaults when stored JSON is corrupt", () => {
      localStorage.setItem(LS_NOTIFY_TOGGLES, "{not valid json");
      expect(loadNotificationToggles()).toEqual(DEFAULT_NOTIFICATION_TOGGLES);
    });

    it("persists toggles and broadcasts a change event without touching the backend when signed out", () => {
      const onChange = listenFor("nebgov-notify-toggles");
      const next = { ...DEFAULT_NOTIFICATION_TOGGLES, active: false };

      saveNotificationToggles(next);

      expect(JSON.parse(localStorage.getItem(LS_NOTIFY_TOGGLES) as string)).toEqual(next);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(mockBackendFetch).not.toHaveBeenCalled();
    });

    it("posts toggles to the backend when signed in", () => {
      mockGetAuthToken.mockReturnValue("token-abc");

      saveNotificationToggles(DEFAULT_NOTIFICATION_TOGGLES);

      expect(mockBackendFetch).toHaveBeenCalledWith(
        "/notifications/preferences",
        expect.objectContaining({
          method: "POST",
          auth: true,
          body: JSON.stringify(DEFAULT_NOTIFICATION_TOGGLES),
        }),
      );
    });

    it("keeps the local save when the best-effort backend sync fails", () => {
      mockGetAuthToken.mockReturnValue("token-abc");
      mockBackendFetch.mockRejectedValue(new Error("offline"));

      expect(() => saveNotificationToggles(DEFAULT_NOTIFICATION_TOGGLES)).not.toThrow();
      expect(JSON.parse(localStorage.getItem(LS_NOTIFY_TOGGLES) as string)).toEqual(
        DEFAULT_NOTIFICATION_TOGGLES,
      );
    });
  });

  describe("notification history", () => {
    it("returns an empty list when nothing is stored", () => {
      expect(loadNotificationHistory()).toEqual([]);
    });

    it("returns an empty list when stored JSON is corrupt", () => {
      localStorage.setItem(LS_NOTIFY_HISTORY, "[oops");
      expect(loadNotificationHistory()).toEqual([]);
    });

    it("prepends new entries as unread, with a generated id and timestamp", () => {
      appendNotificationHistory({
        kind: "active",
        proposalId: "7",
        title: "Voting started",
        body: "Cast your vote",
        at: 1000,
      });
      appendNotificationHistory({
        kind: "executed",
        proposalId: "8",
        title: "Executed",
        body: "Done",
      });

      const [newest, oldest] = loadNotificationHistory();
      expect(newest).toMatchObject({ title: "Executed", proposalId: "8", read: false });
      expect(newest.id).toEqual(expect.any(String));
      expect(newest.at).toEqual(expect.any(Number));
      expect(oldest).toMatchObject({
        title: "Voting started",
        proposalId: "7",
        at: 1000,
        read: false,
      });
    });

    it("keeps only the newest 200 entries", () => {
      const seeded = Array.from({ length: 200 }, (_, i) => ({
        id: `old-${i}`,
        kind: "active",
        proposalId: String(i),
        title: `t${i}`,
        body: "",
        at: i,
        read: true,
      }));
      localStorage.setItem(LS_NOTIFY_HISTORY, JSON.stringify(seeded));

      appendNotificationHistory({ kind: "outcome", proposalId: "999", title: "newest", body: "" });

      const history = loadNotificationHistory();
      expect(history).toHaveLength(200);
      expect(history[0].title).toBe("newest");
      expect(history.find((e) => e.id === "old-199")).toBeUndefined();
      expect(history.find((e) => e.id === "old-0")).toBeDefined();
    });

    it("posts to the backend only when signed in", () => {
      const entry = { kind: "queued" as const, proposalId: "42", title: "Queued", body: "Ready" };

      appendNotificationHistory(entry);
      expect(mockBackendFetch).not.toHaveBeenCalled();

      mockGetAuthToken.mockReturnValue("token-abc");
      appendNotificationHistory(entry);
      expect(mockBackendFetch).toHaveBeenCalledWith(
        "/notifications",
        expect.objectContaining({
          method: "POST",
          auth: true,
          body: JSON.stringify({ type: "queued", proposal_id: 42, message: "Queued\n\nReady" }),
        }),
      );
    });

    it("omits proposal_id when the proposal id is not numeric", () => {
      mockGetAuthToken.mockReturnValue("token-abc");

      appendNotificationHistory({ kind: "active", proposalId: "not-a-number", title: "T", body: "B" });

      const sent = JSON.parse(mockBackendFetch.mock.calls[0][1].body as string);
      expect(sent).not.toHaveProperty("proposal_id");
    });

    it("counts unread entries, treating a missing read flag as unread", () => {
      localStorage.setItem(
        LS_NOTIFY_HISTORY,
        JSON.stringify([
          { id: "a", kind: "active", proposalId: "1", title: "A", body: "", at: 1, read: true },
          { id: "b", kind: "active", proposalId: "2", title: "B", body: "", at: 2 },
          { id: "c", kind: "active", proposalId: "3", title: "C", body: "", at: 3, read: false },
        ]),
      );

      expect(unreadCount()).toBe(2);
    });

    it("marks everything read locally and notifies the backend when signed in", () => {
      localStorage.setItem(
        LS_NOTIFY_HISTORY,
        JSON.stringify([
          { id: "a", kind: "active", proposalId: "1", title: "A", body: "", at: 1 },
        ]),
      );
      const onChange = listenFor("nebgov-notify-history");
      mockGetAuthToken.mockReturnValue("token-abc");

      markAllNotificationsRead();

      expect(unreadCount()).toBe(0);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(mockBackendFetch).toHaveBeenCalledWith(
        "/notifications/mark-read",
        expect.objectContaining({ method: "POST", auth: true, body: JSON.stringify({ all: true }) }),
      );
    });

    it("does nothing when there is no history to mark", () => {
      const onChange = listenFor("nebgov-notify-history");
      mockGetAuthToken.mockReturnValue("token-abc");

      markAllNotificationsRead();

      expect(onChange).not.toHaveBeenCalled();
      expect(mockBackendFetch).not.toHaveBeenCalled();
    });
  });

  describe("syncNotificationsFromBackend", () => {
    it("does nothing when signed out", async () => {
      await syncNotificationsFromBackend();
      expect(mockBackendFetch).not.toHaveBeenCalled();
    });

    it("replaces local toggles and history with the backend copy", async () => {
      mockGetAuthToken.mockReturnValue("token-abc");
      const prefs = { ...DEFAULT_NOTIFICATION_TOGGLES, queued: false };
      mockBackendFetch.mockResolvedValueOnce(prefs).mockResolvedValueOnce({
        data: [
          {
            id: 9,
            type: "outcome",
            proposal_id: 5,
            message: "Proposal passed\n\nQuorum reached\n\nSee details",
            read: true,
            created_at: "2026-01-02T00:00:00.000Z",
          },
          {
            id: 10,
            type: "active",
            proposal_id: null,
            message: null,
            read: false,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      });

      await syncNotificationsFromBackend();

      expect(loadNotificationToggles()).toEqual(prefs);
      const [first, second] = loadNotificationHistory();
      expect(first).toMatchObject({
        id: "9",
        kind: "outcome",
        proposalId: "5",
        title: "Proposal passed",
        body: "Quorum reached\n\nSee details",
        read: true,
        at: Date.parse("2026-01-02T00:00:00.000Z"),
      });
      expect(second).toMatchObject({
        id: "10",
        kind: "active",
        proposalId: "0",
        title: "active",
        body: "",
        read: false,
      });
    });

    it("propagates backend failures and leaves the local cache untouched", async () => {
      mockGetAuthToken.mockReturnValue("token-abc");
      mockBackendFetch.mockRejectedValue(new Error("Backend 500"));

      await expect(syncNotificationsFromBackend()).rejects.toThrow("Backend 500");
      expect(loadNotificationHistory()).toEqual([]);
      expect(localStorage.getItem(LS_NOTIFY_TOGGLES)).toBeNull();
    });
  });

  describe("proposal metadata", () => {
    it("returns an empty map when nothing is stored or the JSON is corrupt", () => {
      expect(loadProposalMeta()).toEqual({});
      localStorage.setItem(LS_PROPOSAL_META, "{broken");
      expect(loadProposalMeta()).toEqual({});
    });

    it("merges entries keyed by the proposal id as a string", () => {
      mergeProposalMetaEntry(12n, { endLedger: 500, startLedger: 400, proposer: "GABC" });
      mergeProposalMetaEntry(13n, { endLedger: 900, startLedger: 800, proposer: "GDEF" });

      expect(loadProposalMeta()).toEqual({
        "12": { endLedger: 500, startLedger: 400, proposer: "GABC" },
        "13": { endLedger: 900, startLedger: 800, proposer: "GDEF" },
      });
    });
  });
});

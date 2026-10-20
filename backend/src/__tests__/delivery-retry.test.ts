/**
 * Coverage for the delivery-retry job (issue #1407).
 *
 * The database is replaced by an in-memory `notification_deliveries` table
 * that understands the handful of statements the job and the notification
 * engine issue, and the webhook endpoint (the job's only network dependency)
 * is replaced by a mocked `fetch`. A local clock stands in for `NOW()` so the
 * backoff schedule can be stepped through deterministically.
 */

interface DeliveryRow {
  id: number;
  rule_id: number;
  channel_type: string;
  event_type: string;
  event_payload: Record<string, unknown>;
  status: "pending" | "retrying" | "delivered" | "failed";
  attempts: number;
  next_retry_at: number | null;
  error_message: string | null;
}

const mockQuery = jest.fn();
jest.mock("../db/pool", () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { DeliveryRetryService } from "../jobs/delivery-retry";
import { jobHealthTracker } from "../jobs/health-tracker";

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 30_000;

const RULE = {
  id: 7,
  user_id: 3,
  name: "New proposals",
  trigger_type: "proposal_created",
  trigger_config: {},
  channels: [{ type: "webhook", url: "https://hooks.example.com/nebgov", secret: "s3cret" }],
  enabled: true,
  cooldown_seconds: 0,
  last_triggered_at: null,
  trigger_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

let now: number;
let deliveries: Map<number, DeliveryRow>;
let fetchMock: jest.Mock;

function seedDelivery(overrides: Partial<DeliveryRow> = {}): DeliveryRow {
  const row: DeliveryRow = {
    id: deliveries.size + 1,
    rule_id: RULE.id,
    channel_type: "webhook",
    event_type: "ProposalCreated",
    event_payload: { proposal_id: "42" },
    status: "retrying",
    attempts: 1,
    next_retry_at: now,
    error_message: "Webhook endpoint returned HTTP 503",
    ...overrides,
  };
  deliveries.set(row.id, row);
  return row;
}

/** Mirrors the SQL in delivery-retry.ts and NotificationEngine against `deliveries`. */
function fakeQuery(sql: string, params: unknown[] = []) {
  if (sql.includes("FROM notification_deliveries nd")) {
    const limit = params[0] as number;
    const rows = [...deliveries.values()]
      .filter((d) => d.status === "retrying" && d.next_retry_at !== null && d.next_retry_at <= now)
      .sort((a, b) => (a.next_retry_at ?? 0) - (b.next_retry_at ?? 0))
      .slice(0, limit)
      .map((d) => ({
        ...d,
        channels: RULE.channels,
        trigger_type: RULE.trigger_type,
        rule_user_id: RULE.user_id,
        trigger_config: RULE.trigger_config,
        cooldown_seconds: RULE.cooldown_seconds,
        enabled: RULE.enabled,
        name: RULE.name,
        last_triggered_at: RULE.last_triggered_at,
        trigger_count: RULE.trigger_count,
        rule_created_at: RULE.created_at,
        rule_updated_at: RULE.updated_at,
      }));
    return { rows };
  }

  if (sql.includes("SET status = 'delivered'")) {
    const row = deliveries.get(params[0] as number)!;
    row.status = "delivered";
    row.attempts += 1;
    row.next_retry_at = null;
    return { rows: [] };
  }

  if (sql.includes("SET attempts = attempts + 1")) {
    const [id, errorMessage, maxRetries, baseDelayMs] = params as [number, string, number, number];
    const row = deliveries.get(id)!;
    const exhausted = row.attempts + 1 >= maxRetries;
    row.next_retry_at = exhausted ? null : now + baseDelayMs * 2 ** row.attempts;
    row.status = exhausted ? "failed" : "retrying";
    row.attempts += 1;
    row.error_message = errorMessage;
    return { rows: [{ status: row.status }] };
  }

  if (sql.includes("SET status = 'failed', next_retry_at = NULL")) {
    const row = deliveries.get(params[0] as number)!;
    row.status = "failed";
    row.next_retry_at = null;
    return { rows: [] };
  }

  throw new Error(`Unexpected query in delivery-retry test: ${sql}`);
}

describe("DeliveryRetryService (issue #1407)", () => {
  beforeEach(() => {
    now = Date.parse("2026-06-01T00:00:00.000Z");
    deliveries = new Map();
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => fakeQuery(sql, params));
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("redelivers a due delivery and marks it delivered when the webhook succeeds", async () => {
    const row = seedDelivery();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await new DeliveryRetryService().processDueRetries();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://hooks.example.com/nebgov");
    expect(row.status).toBe("delivered");
    expect(row.attempts).toBe(2);
    expect(row.next_retry_at).toBeNull();
  });

  it("skips deliveries whose backoff has not elapsed yet", async () => {
    const row = seedDelivery({ next_retry_at: now + 60_000 });

    await new DeliveryRetryService().processDueRetries();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(row.status).toBe("retrying");
    expect(row.attempts).toBe(1);
  });

  it("reschedules failed redeliveries with exponential backoff and stops after the maximum attempts", async () => {
    const row = seedDelivery({ attempts: 1 });
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const service = new DeliveryRetryService();
    const delays: number[] = [];

    // Each cycle advances the clock to exactly when the row becomes due again.
    while (row.status === "retrying") {
      now = row.next_retry_at!;
      await service.processDueRetries();
      if (row.next_retry_at !== null) delays.push(row.next_retry_at - now);
    }

    expect(delays).toEqual([
      BASE_RETRY_DELAY_MS * 2,
      BASE_RETRY_DELAY_MS * 4,
      BASE_RETRY_DELAY_MS * 8,
    ]);
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(MAX_RETRIES);
    expect(row.next_retry_at).toBeNull();
    expect(row.error_message).toBe("Webhook endpoint returned HTTP 503");
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES - 1);

    // Once exhausted the row is never picked up again, however much time passes.
    now += 365 * 24 * 60 * 60 * 1000;
    await service.processDueRetries();
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES - 1);
  });

  it("marks a delivery failed without retrying when its channel was removed from the rule", async () => {
    const row = seedDelivery({ channel_type: "telegram" });

    await new DeliveryRetryService().processDueRetries();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
    expect(row.next_retry_at).toBeNull();
  });

  it("records a job error and leaves deliveries untouched when the database query fails", async () => {
    const row = seedDelivery();
    mockQuery.mockRejectedValueOnce(new Error("connection terminated unexpectedly"));
    const errorSpy = jest.spyOn(jobHealthTracker, "markJobError");
    const successSpy = jest.spyOn(jobHealthTracker, "markJobSuccess");
    const service = new DeliveryRetryService();

    await (service as unknown as { tick(): Promise<void> }).tick();

    expect(errorSpy).toHaveBeenCalledWith("delivery-retry", "connection terminated unexpectedly");
    expect(successSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(row.status).toBe("retrying");
    expect(row.attempts).toBe(1);

    // The next tick picks the same delivery back up.
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await (service as unknown as { tick(): Promise<void> }).tick();
    expect(row.status).toBe("delivered");
    expect(successSpy).toHaveBeenCalledWith("delivery-retry");
  });
});

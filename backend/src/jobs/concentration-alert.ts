import pool from "../db/pool";
import { logger } from "../logger";

interface ConcentrationState {
  nakamotoCoefficient: number;
  top5ShareBps: number;
  giniCoefficientBps: number;
}

const DEFAULT_DANGER_THRESHOLDS = {
  minNakamotoCoefficient: 5,
  maxTop5ShareBps: 6000, // 60%
  maxGiniCoefficientBps: 8000, // 80%
};

export interface ConcentrationThresholdConfig {
  minNakamotoCoefficient: number;
  maxTop5ShareBps: number;
  maxGiniCoefficientBps: number;
}

export interface ConcentrationCheckResult {
  /** Dimension key, e.g. "nakamoto". */
  key: string;
  /** Whether the threshold is currently crossed. */
  alerting: boolean;
  detail: string;
}

/**
 * Pure, DB/network-free threshold evaluation — the healthy→alerting state
 * transition logic kept separate from the service so it can be unit-tested
 * without mocking the indexer or the database.
 *
 * Returns the checks for every dimension; the caller is responsible for
 * tracking previous alert states (map + `writeAlertEvent` on transitions).
 */
export function evaluateConcentrationChecks(
  state: ConcentrationState,
  thresholds: ConcentrationThresholdConfig,
): ConcentrationCheckResult[] {
  return [
    {
      key: "nakamoto",
      alerting: state.nakamotoCoefficient < thresholds.minNakamotoCoefficient,
      detail: `nakamoto_coefficient=${state.nakamotoCoefficient} < ${thresholds.minNakamotoCoefficient}`,
    },
    {
      key: "top5_share",
      alerting: state.top5ShareBps > thresholds.maxTop5ShareBps,
      detail: `top5_share_bps=${state.top5ShareBps} > ${thresholds.maxTop5ShareBps}`,
    },
    {
      key: "gini",
      alerting: state.giniCoefficientBps > thresholds.maxGiniCoefficientBps,
      detail: `gini_coefficient_bps=${state.giniCoefficientBps} > ${thresholds.maxGiniCoefficientBps}`,
    },
  ];
}

/**
 * Pure state-transition detector. Given the previous alert set and the
 * freshly evaluated checks, returns which dimensions transitioned
 * healthy→alerting (should emit) and the resulting new alert set
 * (key → alerting). Re-emission while already alerting is prevented by
 * only returning transitions that go *from* false *to* true, and a return
 * to healthy clears the previous state so a later re-crossing fires again.
 */
export function computeAlertTransitions(
  previous: Map<string, boolean>,
  checks: ConcentrationCheckResult[],
): { transitions: ConcentrationCheckResult[]; nextState: Map<string, boolean> } {
  const nextState = new Map(previous);
  const transitions: ConcentrationCheckResult[] = [];

  for (const check of checks) {
    const prevAlerting = nextState.get(check.key) ?? false;
    if (check.alerting && !prevAlerting) {
      transitions.push(check);
      nextState.set(check.key, true);
    } else if (!check.alerting && prevAlerting) {
      nextState.set(check.key, false);
    }
    // No change: stays in current state — no re-emission while already alerting.
  }

  return { transitions, nextState };
}

/**
 * ConcentrationAlertService — polls the indexer's
 * `/analytics/concentration/latest` and writes event_log rows when a
 * concentration danger threshold is crossed (state transition from healthy
 * → alerting). Follows the same pattern as the existing notification
 * processor: it writes into the same `event_log` table the processor
 * reads, so existing rules using the `concentration_threshold_crossed`
 * trigger fire through the existing NotificationEngine.
 *
 * This service is NOT a separate notification delivery path — it only
 * writes the data that the notification engine already knows how to
 * evaluate.
 */
export class ConcentrationAlertService {
  private interval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private lastAlertStates: Map<string, boolean> = new Map();

  start() {
    const intervalMs = Number(
      process.env.CONCENTRATION_ALERT_INTERVAL_MS ?? "60000",
    );
    logger.info({ intervalMs }, "Starting concentration alert service");
    this.interval = setInterval(() => this.tick(), intervalMs);
    this.tick();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async tick() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.checkConcentration();
    } catch (error) {
      logger.error({ err: error }, "Concentration alert tick failed");
    } finally {
      this.isProcessing = false;
    }
  }

  private async checkConcentration(): Promise<void> {
    const indexerUrl = process.env.INDEXER_URL;
    if (!indexerUrl) {
      logger.warn("INDEXER_URL not set — skipping concentration alert check");
      return;
    }

    let state: ConcentrationState;
    try {
      const resp = await fetch(`${indexerUrl}/analytics/concentration/latest`);
      if (!resp.ok) {
        logger.warn({ status: resp.status }, "Indexer concentration endpoint unavailable");
        return;
      }
      const json = await resp.json();
      if (!json) {
        // No snapshot yet — not an alert condition
        return;
      }
      state = {
        nakamotoCoefficient: Number(json.nakamoto_coefficient ?? 0),
        top5ShareBps: Number(json.top5_share_bps ?? 0),
        giniCoefficientBps: Number(json.gini_coefficient_bps ?? 0),
      };
    } catch (err) {
      logger.warn({ err }, "Failed to fetch concentration state");
      return;
    }

    const thresholds = {
      minNakamotoCoefficient:
        Number(process.env.CONCENTRATION_MIN_NAKAMOTO ?? DEFAULT_DANGER_THRESHOLDS.minNakamotoCoefficient),
      maxTop5ShareBps:
        Number(process.env.CONCENTRATION_MAX_TOP5_BPS ?? DEFAULT_DANGER_THRESHOLDS.maxTop5ShareBps),
      maxGiniCoefficientBps:
        Number(process.env.CONCENTRATION_MAX_GINI_BPS ?? DEFAULT_DANGER_THRESHOLDS.maxGiniCoefficientBps),
    };

    const checks = evaluateConcentrationChecks(state, thresholds);
    const { transitions, nextState } = computeAlertTransitions(this.lastAlertStates, checks);
    this.lastAlertStates = nextState;

    for (const transition of transitions) {
      await this.writeAlertEvent(transition.key, transition.detail);
    }
  }

  private async writeAlertEvent(dimension: string, detail: string): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO event_log (event_type, ledger, payload, indexed_at)
         VALUES ('concentration_threshold_crossed', 0, $1, NOW())`,
        [JSON.stringify({ dimension, detail })],
      );
      logger.info({ dimension, detail }, "Concentration threshold crossed — event written");
    } catch (err) {
      logger.error({ err, dimension }, "Failed to write concentration alert event");
    }
  }
}

export const concentrationAlertService = new ConcentrationAlertService();
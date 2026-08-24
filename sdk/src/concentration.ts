import { ConcentrationSnapshot, GovernorConfig, HolderShare } from "./types";
import { GovernorError, GovernorErrorCode } from "./errors";
import { withRetry, isNetworkError } from "./utils";

function mapConcentrationSnapshot(raw: any): ConcentrationSnapshot {
  return {
    id: Number(raw.id),
    ledger: Number(raw.ledger),
    computedAt: String(raw.computed_at ?? ""),
    totalVotingPower: String(raw.total_voting_power ?? "0"),
    top1ShareBps: Number(raw.top1_share_bps ?? 0),
    top5ShareBps: Number(raw.top5_share_bps ?? 0),
    top10ShareBps: Number(raw.top10_share_bps ?? 0),
    top20ShareBps: Number(raw.top20_share_bps ?? 0),
    giniCoefficientBps: Number(raw.gini_coefficient_bps ?? 0),
    nakamotoCoefficient: Number(raw.nakamoto_coefficient ?? 0),
    delegateTop5ShareBps: Number(raw.delegate_top5_share_bps ?? 0),
    delegateGiniCoefficientBps: Number(raw.delegate_gini_coefficient_bps ?? 0),
  };
}

function mapHolderShare(raw: any): HolderShare {
  return {
    address: String(raw.address ?? raw.voter ?? ""),
    votingPower: String(raw.voting_power ?? raw.total_voting_power ?? "0"),
    shareBps: Number(raw.share_bps ?? 0),
  };
}

/**
 * ConcentrationClient — voting-power concentration and decentralization
 * risk monitor for NebGov (Issue #1012).
 *
 * Entirely indexer-backed: the concentration snapshots are computed
 * periodically by the indexer from its own indexed votes/delegates tables.
 * `config.indexerUrl` is required for every method here.
 *
 * @example
 * const client = new ConcentrationClient({
 *   governorAddress: "CABC...",
 *   votesAddress: "CGHI...",
 *   network: "testnet",
 *   indexerUrl: "https://indexer.example.com",
 * });
 *
 * const latest = await client.getLatestSnapshot();
 * const history = await client.getHistory(30);
 */
export class ConcentrationClient {
  private readonly config: GovernorConfig;

  constructor(config: GovernorConfig) {
    this.config = config;
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, {
      maxAttempts: this.config.maxAttempts,
      baseDelayMs: this.config.baseDelayMs,
      retryOn: isNetworkError,
    });
  }

  private async indexerRequest<T>(path: string): Promise<T> {
    if (!this.config.indexerUrl) {
      throw new GovernorError(
        GovernorErrorCode.SimulationFailed,
        `ConcentrationClient.${path} requires config.indexerUrl to be set`,
      );
    }
    return this.retry(async () => {
      const resp = await fetch(`${this.config.indexerUrl}${path}`);
      if (!resp.ok) {
        throw new GovernorError(
          GovernorErrorCode.SimulationFailed,
          `Indexer request failed: ${resp.status}`,
        );
      }
      return resp.json() as Promise<T>;
    });
  }

  /** Get the most recent concentration snapshot, or null if none has been computed yet. */
  async getLatestSnapshot(): Promise<ConcentrationSnapshot | null> {
    const raw = await this.indexerRequest<any>("/analytics/concentration/latest");
    return raw ? mapConcentrationSnapshot(raw) : null;
  }

  /**
   * Most-recent-first list of concentration snapshots.
   * @param limit Max snapshots to return (default 90).
   */
  async getHistory(limit = 90): Promise<ConcentrationSnapshot[]> {
    const { data } = await this.indexerRequest<{ data: any[] }>(
      `/analytics/concentration/history?limit=${limit}`,
    );
    return (data ?? []).map(mapConcentrationSnapshot);
  }

  /** Top N voting-power holders by share, most-concentrated first. */
  async getTopHolders(limit = 20): Promise<HolderShare[]> {
    const { data } = await this.indexerRequest<{ data: any[] }>(
      `/analytics/concentration/top-holders?limit=${limit}`,
    );
    return (data ?? []).map(mapHolderShare);
  }

  /** Top N delegates by received voting power, most-concentrated first. */
  async getTopDelegates(limit = 20): Promise<HolderShare[]> {
    const { data } = await this.indexerRequest<{ data: any[] }>(
      `/analytics/concentration/top-delegates?limit=${limit}`,
    );
    return (data ?? []).map(mapHolderShare);
  }
}
import { pool } from "./db";
import { invalidatePattern } from "./cache";
import { broadcast } from "./ws";

// Voting-power concentration & decentralization monitor (issue #1012).
//
// The existing `/analytics/*` endpoints (issue #765) measure governance
// *activity* — participation, quorum-hit rate, pass rate. Nothing measured
// *decentralization*: how concentrated voting power is across addresses and
// delegates. This module computes the standard concentration metrics on a
// schedule (mirroring `maybeTakeGovernanceSnapshot`) and persists them to
// `concentration_snapshots` so the API and the notification engine can read a
// single, cheap row.
//
// All power figures are derived entirely from data the indexer already has —
// no new on-chain reads. "Current voting power" for a holder is their most
// recent observed `votes.weight` (the checkpointed voting power the governor
// reported the last time that address voted); delegate power sums each
// delegator's latest observed weight onto their current delegatee.

const SNAPSHOT_INTERVAL_LEDGERS = 100;
const BPS = 10_000n;

/**
 * Gini coefficient of a distribution, in basis points (0 = perfect equality,
 * 10000 = one holder owns everything). Uses the standard mean-absolute-
 * difference form evaluated on the sorted values:
 *
 *   G = ( Σ_i (2i − n − 1) · x_i ) / ( n · Σ_i x_i )      (x sorted ascending, i = 1..n)
 *
 * Returns 0 for an empty distribution, a single holder, or all-zero power.
 */
export function giniCoefficientBps(values: bigint[]): number {
  const xs = values
    .map((v) => (v > 0n ? v : 0n))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = xs.length;
  if (n < 2) return 0;
  const total = xs.reduce((acc, v) => acc + v, 0n);
  if (total <= 0n) return 0;
  const nBig = BigInt(n);
  let weighted = 0n;
  for (let i = 0; i < n; i++) {
    const rank = BigInt(i + 1);
    weighted += (2n * rank - nBig - 1n) * xs[i];
  }
  // weighted / (n * total), scaled to bps. weighted is always >= 0 for sorted xs.
  let bps = Number((weighted * BPS) / (nBig * total));
  if (bps < 0) bps = 0;
  if (bps > 10_000) bps = 10_000;
  return bps;
}

/**
 * Nakamoto coefficient: the minimum number of addresses whose combined voting
 * power *exceeds* 50% of the total — i.e. how many entities would have to
 * collude to control governance. Returns 0 for an empty / all-zero
 * distribution.
 */
export function nakamotoCoefficient(values: bigint[]): number {
  const xs = values
    .map((v) => (v > 0n ? v : 0n))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const total = xs.reduce((acc, v) => acc + v, 0n);
  if (total <= 0n) return 0;
  const half = total / 2n;
  let cumulative = 0n;
  let count = 0;
  for (const v of xs) {
    cumulative += v;
    count++;
    if (cumulative > half) break;
  }
  return count;
}

/**
 * Share of total voting power held by the top `n` addresses, in basis points.
 * Safe when fewer than `n` addresses hold any power (sums whatever exists) and
 * when nothing holds power at all (returns 0 rather than dividing by zero).
 */
export function topNShareBps(values: bigint[], n: number): number {
  if (n <= 0) return 0;
  const xs = values
    .map((v) => (v > 0n ? v : 0n))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const total = xs.reduce((acc, v) => acc + v, 0n);
  if (total <= 0n) return 0;
  const top = xs.slice(0, n).reduce((acc, v) => acc + v, 0n);
  return Number((top * BPS) / total);
}

export interface ConcentrationMetrics {
  total_voting_power: bigint;
  top1_share_bps: number;
  top5_share_bps: number;
  top10_share_bps: number;
  top20_share_bps: number;
  gini_coefficient_bps: number;
  nakamoto_coefficient: number;
  delegate_top5_share_bps: number;
  delegate_gini_coefficient_bps: number;
}

/**
 * Pure aggregation over two power distributions: `holderPowers` (raw voting
 * power per address) and `delegatePowers` (power *received* per delegatee).
 */
export function computeConcentrationMetrics(
  holderPowers: bigint[],
  delegatePowers: bigint[],
): ConcentrationMetrics {
  return {
    total_voting_power: holderPowers.reduce((acc, v) => acc + (v > 0n ? v : 0n), 0n),
    top1_share_bps: topNShareBps(holderPowers, 1),
    top5_share_bps: topNShareBps(holderPowers, 5),
    top10_share_bps: topNShareBps(holderPowers, 10),
    top20_share_bps: topNShareBps(holderPowers, 20),
    gini_coefficient_bps: giniCoefficientBps(holderPowers),
    nakamoto_coefficient: nakamotoCoefficient(holderPowers),
    delegate_top5_share_bps: topNShareBps(delegatePowers, 5),
    delegate_gini_coefficient_bps: giniCoefficientBps(delegatePowers),
  };
}

/**
 * Each address's most recent observed voting power (latest `votes.weight`).
 */
async function loadHolderPowers(): Promise<Map<string, bigint>> {
  const result = await pool.query(
    `SELECT DISTINCT ON (voter) voter, weight
       FROM votes
      ORDER BY voter, ledger DESC, id DESC`,
  );
  const powers = new Map<string, bigint>();
  for (const row of result.rows) {
    powers.set(row.voter as string, BigInt(row.weight as string | number));
  }
  return powers;
}

/**
 * Power received per current delegatee: each delegator's latest observed
 * voting power attributed to whoever they most recently delegated to.
 */
async function loadDelegatePowers(
  holderPowers: Map<string, bigint>,
): Promise<Map<string, bigint>> {
  const result = await pool.query(
    `SELECT DISTINCT ON (delegator) delegator, new_delegatee
       FROM delegates
      ORDER BY delegator, ledger DESC, id DESC`,
  );
  const received = new Map<string, bigint>();
  for (const row of result.rows) {
    const delegatee = row.new_delegatee as string;
    if (!delegatee) continue;
    const power = holderPowers.get(row.delegator as string) ?? 0n;
    if (power <= 0n) continue;
    received.set(delegatee, (received.get(delegatee) ?? 0n) + power);
  }
  return received;
}

/**
 * Compute and persist a concentration snapshot, at most once every
 * `SNAPSHOT_INTERVAL_LEDGERS` ledgers. Mirrors `maybeTakeGovernanceSnapshot`.
 */
export async function maybeTakeConcentrationSnapshot(
  currentLedger: number,
): Promise<void> {
  const lastResult = await pool.query(
    "SELECT ledger FROM concentration_snapshots ORDER BY ledger DESC LIMIT 1",
  );
  const lastLedger = lastResult.rows[0]?.ledger ?? 0;
  if (currentLedger - lastLedger < SNAPSHOT_INTERVAL_LEDGERS) return;

  const holderPowers = await loadHolderPowers();
  const delegatePowers = await loadDelegatePowers(holderPowers);
  const metrics = computeConcentrationMetrics(
    [...holderPowers.values()],
    [...delegatePowers.values()],
  );

  await pool.query(
    `INSERT INTO concentration_snapshots
       (ledger, total_voting_power, top1_share_bps, top5_share_bps,
        top10_share_bps, top20_share_bps, gini_coefficient_bps,
        nakamoto_coefficient, delegate_top5_share_bps,
        delegate_gini_coefficient_bps)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (ledger) DO NOTHING`,
    [
      currentLedger,
      metrics.total_voting_power.toString(),
      metrics.top1_share_bps,
      metrics.top5_share_bps,
      metrics.top10_share_bps,
      metrics.top20_share_bps,
      metrics.gini_coefficient_bps,
      metrics.nakamoto_coefficient,
      metrics.delegate_top5_share_bps,
      metrics.delegate_gini_coefficient_bps,
    ],
  );
  invalidatePattern("analytics:concentration:");
  broadcast({
    type: "analytics_snapshot_taken",
    data: {
      ledger: currentLedger,
      nakamoto_coefficient: metrics.nakamoto_coefficient,
      top5_share_bps: metrics.top5_share_bps,
    },
  });
}

import { pool } from "./db";

/**
 * Compute the Gini coefficient for a sorted array of voting-power values.
 * Returns basis points (0-10000) where 0 = perfect equality and 10000 =
 * maximum inequality (one address holds everything).
 *
 * Uses the relative mean absolute difference formula:
 *   G = (2 * Σ(i+1)*y_i) / (n * Σy_i) - (n+1)/n
 *
 * where y_i are sorted ascending and n is the count.
 * Clamped to [0, 10000] for storage.
 */
function giniCoefficientBps(sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  const n = sortedValues.length;
  const total = sortedValues.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * sortedValues[i];
  }
  const gini = (2 * weightedSum) / (n * total) - (n + 1) / n;
  // Clamp and convert to basis points
  return Math.round(Math.max(0, Math.min(1, gini)) * 10000);
}

/**
 * Compute the Nakamoto coefficient: the minimum number of addresses whose
 * combined voting power exceeds 50% of the total. `sortedValues` must be
 * sorted descending.
 */
function nakamotoCoefficient(sortedDescending: number[], total: number): number {
  if (sortedDescending.length === 0 || total === 0) return 0;
  const half = total / 2;
  let cumulative = 0;
  for (let i = 0; i < sortedDescending.length; i++) {
    cumulative += sortedDescending[i];
    if (cumulative > half) return i + 1;
  }
  return sortedDescending.length;
}

/**
 * Compute top-N share as basis points. `sortedDescending` must be sorted
 * descending, and `total` is the sum of all values (not just the top N).
 */
function topNShareBps(sortedDescending: number[], n: number, total: number): number {
  if (total === 0) return 0;
  const nValues = sortedDescending.slice(0, n);
  const sum = nValues.reduce((a, b) => a + b, 0);
  return Math.round((sum / total) * 10000);
}

/**
 * Compute a full concentration snapshot for the current ledger and persist
 * it to the `concentration_snapshots` table. Returns the snapshot row, or
 * null if the computation was skipped (e.g. no voting data indexed yet).
 *
 * The computation reads voting power and delegation data from the
 * indexer's own tables — it does not make on-chain calls.
 */
export async function computeAndPersistConcentration(
  currentLedger: number,
): Promise<{
  top1ShareBps: number;
  top5ShareBps: number;
  top10ShareBps: number;
  top20ShareBps: number;
  giniCoefficientBps: number;
  nakamotoCoefficient: number;
  delegateTop5ShareBps: number;
  delegateGiniCoefficientBps: number;
  totalVotingPower: string;
} | null> {
  // 1. Get voting power per address from the votes table.
  //    Each address's total voting power is the sum of their vote weights.
  //    (The indexer's `votes` table tracks every vote cast with its weight.)
  const holderResult = await pool.query<{ address: string; power: number }>(
    `SELECT voter AS address, SUM(weight)::numeric AS power
     FROM votes
     WHERE weight > 0
     GROUP BY voter
     HAVING SUM(weight) > 0
     ORDER BY SUM(weight) DESC`,
  );

  const powerValues = holderResult.rows.map((r) => Number(r.power));
  const totalPower = powerValues.reduce((a, b) => a + b, 0);

  if (powerValues.length === 0 || totalPower === 0) {
    // No voting data yet — insert a zeroed snapshot so the endpoints
    // return something rather than 404.
    await pool.query(
      `INSERT INTO concentration_snapshots
        (ledger, total_voting_power, top1_share_bps, top5_share_bps, top10_share_bps,
         top20_share_bps, gini_coefficient_bps, nakamoto_coefficient,
         delegate_top5_share_bps, delegate_gini_coefficient_bps)
       VALUES ($1, 0, 0, 0, 0, 0, 0, 0, 0, 0)
       ON CONFLICT DO NOTHING`,
      [currentLedger],
    );
    return null;
  }

  // 2. Compute holder-side metrics
  const sortedDesc = [...powerValues].sort((a, b) => b - a);
  const sortedAsc = [...powerValues].sort((a, b) => a - b);

  const top1 = topNShareBps(sortedDesc, 1, totalPower);
  const top5 = topNShareBps(sortedDesc, 5, totalPower);
  const top10 = topNShareBps(sortedDesc, 10, totalPower);
  const top20 = topNShareBps(sortedDesc, 20, totalPower);
  const gini = giniCoefficientBps(sortedAsc);
  const nakamoto = nakamotoCoefficient(sortedDesc, totalPower);

  // 3. Compute delegate-side metrics
  let delegateTop5 = 0;
  let delegateGini = 0;

  const delegateResult = await pool.query<{ delegatee: string; power: number }>(
    `SELECT delegatee_address AS delegatee, SUM(power_at_delegation)::numeric AS power
     FROM delegation_entries
     WHERE active = TRUE
     GROUP BY delegatee_address
     HAVING SUM(power_at_delegation) > 0
     ORDER BY SUM(power_at_delegation) DESC`,
  );

  if (delegateResult.rows.length > 0) {
    const delegatePowers = delegateResult.rows.map((r) => Number(r.power));
    const totalDelegatePower = delegatePowers.reduce((a, b) => a + b, 0);
    const delSortedDesc = [...delegatePowers].sort((a, b) => b - a);
    const delSortedAsc = [...delegatePowers].sort((a, b) => a - b);

    delegateTop5 = topNShareBps(delSortedDesc, 5, totalDelegatePower);
    delegateGini = giniCoefficientBps(delSortedAsc);
  }

  // 4. Persist snapshot
  await pool.query(
    `INSERT INTO concentration_snapshots
      (ledger, total_voting_power, top1_share_bps, top5_share_bps, top10_share_bps,
       top20_share_bps, gini_coefficient_bps, nakamoto_coefficient,
       delegate_top5_share_bps, delegate_gini_coefficient_bps)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT DO NOTHING`,
    [currentLedger, String(totalPower), top1, top5, top10, top20, gini, nakamoto, delegateTop5, delegateGini],
  );

  return {
    top1ShareBps: top1,
    top5ShareBps: top5,
    top10ShareBps: top10,
    top20ShareBps: top20,
    giniCoefficientBps: gini,
    nakamotoCoefficient: nakamoto,
    delegateTop5ShareBps: delegateTop5,
    delegateGiniCoefficientBps: delegateGini,
    totalVotingPower: String(totalPower),
  };
}

/**
 * Get the most recent concentration snapshot's ledger, or 0 if none exists.
 */
export async function getLastConcentrationLedger(): Promise<number> {
  const result = await pool.query(
    "SELECT ledger FROM concentration_snapshots ORDER BY ledger DESC LIMIT 1",
  );
  return result.rows[0]?.ledger ?? 0;
}

/**
 * Get top N holders by voting power (descending).
 */
export async function getTopHolders(
  limit: number,
): Promise<Array<{ address: string; votingPower: string; shareBps: number }>> {
  const totalResult = await pool.query(
    "SELECT SUM(weight)::numeric AS total FROM votes WHERE weight > 0",
  );
  const totalPower = Number(totalResult.rows[0]?.total ?? 0);

  const result = await pool.query<{ address: string; power: string }>(
    `SELECT voter AS address, SUM(weight)::numeric AS power
     FROM votes
     WHERE weight > 0
     GROUP BY voter
     ORDER BY SUM(weight) DESC
     LIMIT $1`,
    [limit],
  );

  return result.rows.map((r) => ({
    address: r.address,
    votingPower: String(r.power),
    shareBps: totalPower > 0 ? Math.round((Number(r.power) / totalPower) * 10000) : 0,
  }));
}

/**
 * Get top N delegates by received voting power (descending).
 */
export async function getTopDelegates(
  limit: number,
): Promise<Array<{ address: string; votingPower: string; shareBps: number }>> {
  const totalResult = await pool.query(
    "SELECT SUM(power_at_delegation)::numeric AS total FROM delegation_entries WHERE active = TRUE",
  );
  const totalPower = Number(totalResult.rows[0]?.total ?? 0);

  const result = await pool.query<{ address: string; power: string }>(
    `SELECT delegatee_address AS address, SUM(power_at_delegation)::numeric AS power
     FROM delegation_entries
     WHERE active = TRUE
     GROUP BY delegatee_address
     ORDER BY SUM(power_at_delegation) DESC
     LIMIT $1`,
    [limit],
  );

  return result.rows.map((r) => ({
    address: r.address,
    votingPower: String(r.power),
    shareBps: totalPower > 0 ? Math.round((Number(r.power) / totalPower) * 10000) : 0,
  }));
}
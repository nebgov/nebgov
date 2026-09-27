import pool from "../db/pool";
import { logger } from "../logger";
import { jobHealthTracker } from "./health-tracker";

const SNAPSHOT_RETENTION_DAYS = Number(process.env.SNAPSHOT_RETENTION_DAYS ?? "90");
const SNAPSHOT_MIN_DELTA = Number(process.env.SNAPSHOT_MIN_DELTA ?? "0");

/**
 * Daily leaderboard snapshot job
 * Should be run via cron at midnight UTC
 */
export async function takeLeaderboardSnapshot() {
  jobHealthTracker.markJobStart("leaderboard-snapshot");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get current leaderboard state
    const leaderboardResult = await client.query(`
      SELECT user_id, score, rank
      FROM leaderboard
      ORDER BY rank ASC
    `);

    const latestSnapshotResult = await client.query(`
      SELECT user_id, score
      FROM leaderboard_history
      WHERE snapshot_date = (
        SELECT MAX(snapshot_date) FROM leaderboard_history
      )
    `);
    const latestSnapshotScores = new Map(
      latestSnapshotResult.rows.map((row) => [String(row.user_id), Number(row.score)]),
    );

    // Insert snapshots for all users
    for (const row of leaderboardResult.rows) {
      const previousScore = latestSnapshotScores.get(String(row.user_id));
      if (
        previousScore !== undefined &&
        Math.abs(Number(row.score) - previousScore) < SNAPSHOT_MIN_DELTA
      ) {
        continue;
      }
      await client.query(
        `INSERT INTO leaderboard_history (user_id, score, rank, snapshot_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, snapshot_date) DO UPDATE
         SET score = EXCLUDED.score, rank = EXCLUDED.rank`,
        [row.user_id, row.score, row.rank, today],
      );
    }

    if (Number.isFinite(SNAPSHOT_RETENTION_DAYS) && SNAPSHOT_RETENTION_DAYS > 0) {
      await client.query(
        `
        DELETE FROM leaderboard_history
        WHERE snapshot_date < CURRENT_DATE - ($1::int * INTERVAL '1 day')
      `,
        [SNAPSHOT_RETENTION_DAYS],
      );
    }

    await client.query("COMMIT");
    logger.info({ snapshotDate: today.toISOString() }, "Leaderboard snapshot taken");
    jobHealthTracker.markJobSuccess("leaderboard-snapshot");
  } catch (error) {
    await client.query("ROLLBACK");
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, "Failed to take leaderboard snapshot");
    jobHealthTracker.markJobError("leaderboard-snapshot", errorMessage);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  takeLeaderboardSnapshot()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

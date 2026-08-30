import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import pool from "../db/pool";

const TEST_PROPOSAL_ID = 12345;
const TEST_PROPOSER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABY2V5";
const TEST_AMENDER = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY2V5";

describe("proposal-amendments database", () => {
  beforeAll(async () => {
    // Create test proposal
    await pool.query(
      `INSERT INTO proposals (id, proposer, description, start_ledger, end_ledger, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_PROPOSAL_ID, TEST_PROPOSER, "Original description", 1000, 2000],
    );
  });

  afterAll(async () => {
    // Cleanup
    await pool.query("DELETE FROM proposal_amendments WHERE proposal_id = $1", [TEST_PROPOSAL_ID]);
    await pool.query("DELETE FROM proposals WHERE id = $1", [TEST_PROPOSAL_ID]);
    await pool.end();
  });

  it("should insert a proposal amendment", async () => {
    const result = await pool.query(
      `INSERT INTO proposal_amendments
       (proposal_id, version, amended_by, description, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [TEST_PROPOSAL_ID, 1, TEST_PROPOSER, "Updated description", "Fixed typo"],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].proposal_id).toBe(TEST_PROPOSAL_ID);
    expect(result.rows[0].version).toBe(1);
    expect(result.rows[0].amended_by).toBe(TEST_PROPOSER);
    expect(result.rows[0].description).toBe("Updated description");
  });

  it("should fetch all amendments for a proposal", async () => {
    // Insert a second amendment
    await pool.query(
      `INSERT INTO proposal_amendments
       (proposal_id, version, amended_by, description, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (proposal_id, version) DO NOTHING`,
      [TEST_PROPOSAL_ID, 2, TEST_PROPOSER, "Second update", "Clarity improvement"],
    );

    const result = await pool.query(
      "SELECT * FROM proposal_amendments WHERE proposal_id = $1 ORDER BY version ASC",
      [TEST_PROPOSAL_ID],
    );

    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].version).toBe(1);
  });

  it("should update current_amendment_version", async () => {
    await pool.query("UPDATE proposals SET current_amendment_version = $1 WHERE id = $2", [
      1,
      TEST_PROPOSAL_ID,
    ]);

    const result = await pool.query("SELECT current_amendment_version FROM proposals WHERE id = $1", [
      TEST_PROPOSAL_ID,
    ]);

    expect(result.rows[0].current_amendment_version).toBe(1);
  });

  it("should enforce unique constraint on proposal_id and version", async () => {
    try {
      await pool.query(
        `INSERT INTO proposal_amendments
         (proposal_id, version, amended_by, description)
         VALUES ($1, $2, $3, $4)`,
        [TEST_PROPOSAL_ID, 1, TEST_PROPOSER, "Duplicate version"],
      );
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect((error as any).code).toBe("23505"); // Unique constraint violation
    }
  });

  it("should fetch a specific amendment version", async () => {
    const result = await pool.query(
      "SELECT * FROM proposal_amendments WHERE proposal_id = $1 AND version = $2",
      [TEST_PROPOSAL_ID, 1],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].description).toBe("Updated description");
  });
});

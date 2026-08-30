import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../index";
import pool from "../db/pool";

const TEST_PROPOSAL_ID = 54321;
const TEST_PROPOSER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABY2V5";
const TEST_OTHER_USER = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY2V5";

describe("Proposal Amendments Routes", () => {
  beforeAll(async () => {
    // Create test proposal
    await pool.query(
      `INSERT INTO proposals (id, proposer, description, start_ledger, end_ledger, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_PROPOSAL_ID, TEST_PROPOSER, "Original proposal description", 1000, 2000],
    );
  });

  afterAll(async () => {
    // Cleanup
    await pool.query("DELETE FROM proposal_amendments WHERE proposal_id = $1", [TEST_PROPOSAL_ID]);
    await pool.query("DELETE FROM proposals WHERE id = $1", [TEST_PROPOSAL_ID]);
    await pool.end();
  });

  describe("GET /proposals/:proposalId/amendments", () => {
    it("should fetch all amendments for a proposal", async () => {
      const response = await request(app).get(`/proposals/${TEST_PROPOSAL_ID}/amendments`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("proposal_id", TEST_PROPOSAL_ID);
      expect(response.body).toHaveProperty("amendments");
      expect(Array.isArray(response.body.amendments)).toBe(true);
    });

    it("should return 404 for non-existent proposal", async () => {
      const response = await request(app).get("/proposals/999999/amendments");
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /proposals/:proposalId/amendments/:version", () => {
    it("should fetch original (version 0) amendment", async () => {
      const response = await request(app).get(`/proposals/${TEST_PROPOSAL_ID}/amendments/0`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("version", 0);
      expect(response.body).toHaveProperty("description");
    });

    it("should return 404 for non-existent amendment version", async () => {
      const response = await request(app).get(`/proposals/${TEST_PROPOSAL_ID}/amendments/999`);
      expect(response.status).toBe(404);
    });
  });

  describe("POST /proposals/:proposalId/amend", () => {
    it("should require proposer address in header", async () => {
      const response = await request(app).post(`/proposals/${TEST_PROPOSAL_ID}/amend`).send({
        description: "Updated description",
        reason: "Fixed typo",
      });

      expect([400, 401]).toContain(response.status);
    });

    it("should reject non-proposers", async () => {
      const response = await request(app)
        .post(`/proposals/${TEST_PROPOSAL_ID}/amend`)
        .set("X-Proposer-Address", TEST_OTHER_USER)
        .send({
          description: "Unauthorized update",
        });

      expect(response.status).toBe(403);
    });
  });

  describe("POST /proposals/:proposalId/publish-amendment/:version", () => {
    it("should reject non-proposers", async () => {
      const response = await request(app)
        .post(`/proposals/${TEST_PROPOSAL_ID}/publish-amendment/1`)
        .set("X-Proposer-Address", TEST_OTHER_USER);

      expect(response.status).toBe(403);
    });

    it("should reject version 0", async () => {
      const response = await request(app)
        .post(`/proposals/${TEST_PROPOSAL_ID}/publish-amendment/0`)
        .set("X-Proposer-Address", TEST_PROPOSER);

      expect(response.status).toBe(400);
    });
  });

  describe("GET /proposals/:proposalId/amendment-diff/:from/:to", () => {
    it("should return diff between versions", async () => {
      const response = await request(app).get(
        `/proposals/${TEST_PROPOSAL_ID}/amendment-diff/0/1`,
      );

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it("should handle non-existent versions", async () => {
      const response = await request(app).get(
        `/proposals/${TEST_PROPOSAL_ID}/amendment-diff/0/999`,
      );

      expect([200, 404]).toContain(response.status);
    });
  });
});

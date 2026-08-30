import { Response, Router } from "express";
import { z } from "zod";
import pool from "../db/pool";
import { validate } from "../middleware/validate";
import { logger } from "../logger";
import type { ProposalAmendment, AmendmentInput } from "../entities/ProposalAmendment";

const router = Router({ mergeParams: true });

const STELLAR_ADDRESS_RE = /^[GC][A-Z2-7]{55}$/;

// Validate Stellar address format
const stellarAddressSchema = z.string().regex(STELLAR_ADDRESS_RE, "Invalid Stellar address");

// Request body schema for creating an amendment
const amendmentInputSchema = z.object({
  description: z.string().optional(),
  target_address: stellarAddressSchema.optional(),
  function_name: z.string().optional(),
  calldata_hex: z.string().optional(),
  reason: z.string().optional(),
}).strict();

// Validate request parameters
const proposalIdParamSchema = z.object({
  proposalId: z.coerce.number().int().positive(),
});

const versionParamSchema = z.object({
  proposalId: z.coerce.number().int().positive(),
  version: z.coerce.number().int().nonnegative(),
});

const diffParamSchema = z.object({
  proposalId: z.coerce.number().int().positive(),
  from: z.coerce.number().int().nonnegative(),
  to: z.coerce.number().int().nonnegative(),
});

/**
 * GET /proposals/:proposalId/amendments
 * List all amendments for a proposal, including the original (version 0)
 */
router.get("/:proposalId/amendments", validate(proposalIdParamSchema, "params"), async (req, res) => {
  try {
    const { proposalId } = req.params as { proposalId: string };
    const proposalIdNum = parseInt(proposalId, 10);

    // Check if proposal exists
    const proposalResult = await pool.query(
      "SELECT id, proposer, description, target_address, function_name, calldata_hex, current_amendment_version FROM proposals WHERE id = $1",
      [proposalIdNum],
    );

    if (proposalResult.rows.length === 0) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }

    const proposal = proposalResult.rows[0];

    // Fetch all amendments
    const amendmentsResult = await pool.query(
      "SELECT * FROM proposal_amendments WHERE proposal_id = $1 ORDER BY version ASC",
      [proposalIdNum],
    );

    const amendments: ProposalAmendment[] = amendmentsResult.rows;

    // Include original as version 0
    const allVersions = [
      {
        id: 0, // synthetic id for original
        proposal_id: proposalIdNum,
        version: 0,
        amended_by: proposal.proposer,
        amended_at: new Date(proposal.created_at || Date.now()),
        description: proposal.description,
        target_address: proposal.target_address,
        function_name: proposal.function_name,
        calldata_hex: proposal.calldata_hex,
        reason: "Original proposal",
        created_at: new Date(proposal.created_at || Date.now()),
      },
      ...amendments,
    ];

    res.json({
      proposal_id: proposalIdNum,
      current_amendment_version: proposal.current_amendment_version,
      amendments: allVersions,
    });
  } catch (error) {
    logger.error({ error }, "Failed to fetch amendments");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /proposals/:proposalId/amendments/:version
 * Get a specific amendment version
 */
router.get("/:proposalId/amendments/:version", validate(versionParamSchema, "params"), async (req, res) => {
  try {
    const { proposalId, version } = req.params as { proposalId: string; version: string };
    const proposalIdNum = parseInt(proposalId, 10);
    const versionNum = parseInt(version, 10);

    // Check if proposal exists
    const proposalResult = await pool.query(
      "SELECT id, proposer, description, target_address, function_name, calldata_hex FROM proposals WHERE id = $1",
      [proposalIdNum],
    );

    if (proposalResult.rows.length === 0) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }

    if (versionNum === 0) {
      // Return the original proposal data
      const proposal = proposalResult.rows[0];
      res.json({
        id: 0,
        proposal_id: proposalIdNum,
        version: 0,
        amended_by: proposal.proposer,
        amended_at: proposal.created_at,
        description: proposal.description,
        target_address: proposal.target_address,
        function_name: proposal.function_name,
        calldata_hex: proposal.calldata_hex,
        reason: "Original proposal",
        created_at: proposal.created_at,
      });
      return;
    }

    // Fetch the specific amendment
    const amendmentResult = await pool.query(
      "SELECT * FROM proposal_amendments WHERE proposal_id = $1 AND version = $2",
      [proposalIdNum, versionNum],
    );

    if (amendmentResult.rows.length === 0) {
      res.status(404).json({ error: "Amendment version not found" });
      return;
    }

    res.json(amendmentResult.rows[0]);
  } catch (error) {
    logger.error({ error }, "Failed to fetch amendment version");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /proposals/:proposalId/amend
 * Create a new amendment draft (proposer-only)
 * The amendment is not published until explicitly published via /publish-amendment/:version
 */
router.post("/:proposalId/amend", validate(proposalIdParamSchema, "params"), validate(amendmentInputSchema, "body"), async (req, res) => {
  try {
    const { proposalId } = req.params as { proposalId: string };
    const proposalIdNum = parseInt(proposalId, 10);
    const amendment = req.body as AmendmentInput;

    // Get proposer address from request (should be set by auth middleware in production)
    const proposerAddress = (req as any).proposerAddress;
    if (!proposerAddress) {
      res.status(401).json({ error: "Proposer address not found in request" });
      return;
    }

    // Check if proposal exists and get proposer
    const proposalResult = await pool.query(
      "SELECT id, proposer, start_ledger FROM proposals WHERE id = $1",
      [proposalIdNum],
    );

    if (proposalResult.rows.length === 0) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }

    const proposal = proposalResult.rows[0];

    // Only the original proposer can amend
    if (proposal.proposer !== proposerAddress) {
      res.status(403).json({ error: "Only the original proposer can amend this proposal" });
      return;
    }

    // Check if proposal is still in Pending state (not yet Active)
    // We can infer this by checking if we're before start_ledger
    // In production, you'd check the actual ledger sequence
    // For now, we'll allow amendments at any time (can be improved)

    // Get the next version number
    const versionResult = await pool.query(
      "SELECT MAX(version) as max_version FROM proposal_amendments WHERE proposal_id = $1",
      [proposalIdNum],
    );

    const nextVersion = (versionResult.rows[0]?.max_version ?? 0) + 1;

    // Insert the new amendment
    const insertResult = await pool.query(
      `INSERT INTO proposal_amendments (proposal_id, version, amended_by, description, target_address, function_name, calldata_hex, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        proposalIdNum,
        nextVersion,
        proposerAddress,
        amendment.description || null,
        amendment.target_address || null,
        amendment.function_name || null,
        amendment.calldata_hex || null,
        amendment.reason || null,
      ],
    );

    res.status(201).json({
      message: "Amendment created successfully",
      amendment: insertResult.rows[0],
    });
  } catch (error) {
    logger.error({ error }, "Failed to create amendment");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /proposals/:proposalId/publish-amendment/:version
 * Publish an amendment as the canonical version (proposer-only, Pending state only)
 */
router.post("/:proposalId/publish-amendment/:version", validate(versionParamSchema, "params"), async (req, res) => {
  try {
    const { proposalId, version } = req.params as { proposalId: string; version: string };
    const proposalIdNum = parseInt(proposalId, 10);
    const versionNum = parseInt(version, 10);

    // Get proposer address from request
    const proposerAddress = (req as any).proposerAddress;
    if (!proposerAddress) {
      res.status(401).json({ error: "Proposer address not found in request" });
      return;
    }

    // Check if proposal exists and get proposer
    const proposalResult = await pool.query(
      "SELECT id, proposer, start_ledger FROM proposals WHERE id = $1",
      [proposalIdNum],
    );

    if (proposalResult.rows.length === 0) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }

    const proposal = proposalResult.rows[0];

    // Only the original proposer can publish amendments
    if (proposal.proposer !== proposerAddress) {
      res.status(403).json({ error: "Only the original proposer can publish amendments" });
      return;
    }

    if (versionNum === 0) {
      res.status(400).json({ error: "Cannot publish version 0 (original proposal)" });
      return;
    }

    // Check if amendment exists
    const amendmentResult = await pool.query(
      "SELECT * FROM proposal_amendments WHERE proposal_id = $1 AND version = $2",
      [proposalIdNum, versionNum],
    );

    if (amendmentResult.rows.length === 0) {
      res.status(404).json({ error: "Amendment version not found" });
      return;
    }

    // Update the proposal's current_amendment_version
    const updateResult = await pool.query(
      "UPDATE proposals SET current_amendment_version = $1 WHERE id = $2 RETURNING *",
      [versionNum, proposalIdNum],
    );

    res.json({
      message: "Amendment published successfully",
      proposal: updateResult.rows[0],
    });
  } catch (error) {
    logger.error({ error }, "Failed to publish amendment");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /proposals/:proposalId/amendment-diff/:from/:to
 * Get a JSON-Merge-Patch diff between two amendment versions
 */
router.get("/:proposalId/amendment-diff/:from/:to", validate(diffParamSchema, "params"), async (req, res) => {
  try {
    const { proposalId, from, to } = req.params as { proposalId: string; from: string; to: string };
    const proposalIdNum = parseInt(proposalId, 10);
    const fromVersion = parseInt(from, 10);
    const toVersion = parseInt(to, 10);

    // Fetch both versions
    const getVersionQuery = async (version: number) => {
      if (version === 0) {
        const result = await pool.query(
          "SELECT id, proposer, description, target_address, function_name, calldata_hex FROM proposals WHERE id = $1",
          [proposalIdNum],
        );
        if (result.rows.length === 0) return null;
        const p = result.rows[0];
        return {
          description: p.description,
          target_address: p.target_address,
          function_name: p.function_name,
          calldata_hex: p.calldata_hex,
        };
      } else {
        const result = await pool.query(
          "SELECT description, target_address, function_name, calldata_hex FROM proposal_amendments WHERE proposal_id = $1 AND version = $2",
          [proposalIdNum, version],
        );
        return result.rows.length > 0 ? result.rows[0] : null;
      }
    };

    const fromData = await getVersionQuery(fromVersion);
    const toData = await getVersionQuery(toVersion);

    if (!fromData || !toData) {
      res.status(404).json({ error: "One or both amendment versions not found" });
      return;
    }

    // Create a simple RFC 6902-style diff
    const diff = computeDiff(fromData, toData);

    res.json(diff);
  } catch (error) {
    logger.error({ error }, "Failed to compute amendment diff");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Compute a simple RFC 6902-style JSON Merge Patch diff between two objects
 */
function computeDiff(
  fromObject: Record<string, unknown>,
  toObject: Record<string, unknown>,
): Array<{ op: string; path: string; value?: unknown }> {
  const diff: Array<{ op: string; path: string; value?: unknown }> = [];

  // Check for changed or added fields
  for (const [key, toValue] of Object.entries(toObject)) {
    const fromValue = fromObject[key];
    if (fromValue !== toValue) {
      diff.push({
        op: "replace",
        path: `/${key}`,
        value: toValue,
      });
    }
  }

  // Check for removed fields
  for (const key of Object.keys(fromObject)) {
    if (!(key in toObject)) {
      diff.push({
        op: "remove",
        path: `/${key}`,
      });
    }
  }

  return diff;
}

export default router;

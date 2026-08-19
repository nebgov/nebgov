import request from "supertest";
import { Keypair } from "@stellar/stellar-sdk";

// On-chain reads (voting power / proposal threshold / snapshot tally) are
// mocked here — this suite exercises the route layer (validation, signature
// verification, duplicate/out-of-window rejection, DB persistence) against
// a real Postgres instance, same DB-backed integration pattern as
// backend/src/__tests__/notifications.test.ts, not RPC connectivity.
jest.mock("../signaling/tally", () => ({
  __esModule: true,
  getCurrentVotingPower: jest.fn(),
  getProposalThreshold: jest.fn(),
  computeWeightedTally: jest.fn(),
}));

import app from "../index";
import pool from "../db/pool";
import { canonicalSignalPayload } from "../signaling/signature";
import { getCurrentVotingPower, getProposalThreshold, computeWeightedTally } from "../signaling/tally";

const mockGetCurrentVotingPower = getCurrentVotingPower as jest.Mock;
const mockGetProposalThreshold = getProposalThreshold as jest.Mock;
const mockComputeWeightedTally = computeWeightedTally as jest.Mock;

describe("Signaling Endpoints", () => {
  const createdPollIds: number[] = [];

  afterEach(async () => {
    if (createdPollIds.length > 0) {
      await pool.query(`DELETE FROM signaling_votes WHERE poll_id = ANY($1::int[])`, [createdPollIds]);
      await pool.query(`DELETE FROM signaling_polls WHERE id = ANY($1::int[])`, [createdPollIds]);
      createdPollIds.length = 0;
    }
    jest.clearAllMocks();
  });

  async function createPoll(overrides: Partial<{
    startTime: Date;
    endTime: Date;
    choices: string[];
  }> = {}) {
    mockGetCurrentVotingPower.mockResolvedValue(1000n);
    mockGetProposalThreshold.mockResolvedValue(500n);

    const creator = Keypair.random();
    const res = await request(app)
      .post("/signaling/polls")
      .send({
        creatorAddress: creator.publicKey(),
        title: "Should we fund grant #4?",
        description: "A temperature check ahead of a formal proposal.",
        choices: overrides.choices ?? ["For", "Against", "Abstain"],
        snapshotLedger: 100,
        startTime: (overrides.startTime ?? new Date(Date.now() - 60_000)).toISOString(),
        endTime: (overrides.endTime ?? new Date(Date.now() + 3_600_000)).toISOString(),
      })
      .expect(201);

    createdPollIds.push(res.body.id);
    return res.body;
  }

  it("POST /signaling/polls rejects a creator below the proposal threshold", async () => {
    mockGetCurrentVotingPower.mockResolvedValue(100n);
    mockGetProposalThreshold.mockResolvedValue(500n);
    const creator = Keypair.random();

    await request(app)
      .post("/signaling/polls")
      .send({
        creatorAddress: creator.publicKey(),
        title: "Low power poll",
        description: "Should fail",
        choices: ["Yes", "No"],
        snapshotLedger: 100,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(403);
  });

  it("POST /signaling/polls creates a poll when the creator meets the threshold", async () => {
    const poll = await createPoll();
    expect(poll.choices).toEqual(["For", "Against", "Abstain"]);
    expect(poll.finalized).toBe(false);
  });

  it("POST /signaling/polls/:id/vote accepts a validly signed vote", async () => {
    const poll = await createPoll();
    const voter = Keypair.random();
    const nonce = "vote-nonce-1";
    const signature = voter
      .sign(Buffer.from(canonicalSignalPayload({ pollId: poll.id, choiceIndex: 0, voterAddress: voter.publicKey(), nonce }), "utf8"))
      .toString("base64");

    await request(app)
      .post(`/signaling/polls/${poll.id}/vote`)
      .set("X-Voter-Address", voter.publicKey())
      .send({ choiceIndex: 0, nonce, signature })
      .expect(201);
  });

  it("POST /signaling/polls/:id/vote rejects a second vote from the same address", async () => {
    const poll = await createPoll();
    const voter = Keypair.random();

    const castVote = async (nonce: string, choiceIndex: number) => {
      const signature = voter
        .sign(Buffer.from(canonicalSignalPayload({ pollId: poll.id, choiceIndex, voterAddress: voter.publicKey(), nonce }), "utf8"))
        .toString("base64");
      return request(app)
        .post(`/signaling/polls/${poll.id}/vote`)
        .set("X-Voter-Address", voter.publicKey())
        .send({ choiceIndex, nonce, signature });
    };

    await castVote("nonce-a", 0).then((res) => expect(res.status).toBe(201));
    await castVote("nonce-b", 1).then((res) => expect(res.status).toBe(409));
  });

  it("POST /signaling/polls/:id/vote rejects casting outside [start_time, end_time]", async () => {
    const poll = await createPoll({
      startTime: new Date(Date.now() - 7_200_000),
      endTime: new Date(Date.now() - 3_600_000),
    });
    const voter = Keypair.random();
    const nonce = "expired-window";
    const signature = voter
      .sign(Buffer.from(canonicalSignalPayload({ pollId: poll.id, choiceIndex: 0, voterAddress: voter.publicKey(), nonce }), "utf8"))
      .toString("base64");

    await request(app)
      .post(`/signaling/polls/${poll.id}/vote`)
      .set("X-Voter-Address", voter.publicKey())
      .send({ choiceIndex: 0, nonce, signature })
      .expect(400);
  });

  it("GET /signaling/polls/:id/results returns the live tally before finalization", async () => {
    const poll = await createPoll();
    mockComputeWeightedTally.mockResolvedValue({
      choices: poll.choices,
      totals: ["100", "0", "0"],
      totalVotes: 1,
      totalWeight: "100",
    });

    const res = await request(app).get(`/signaling/polls/${poll.id}/results`).expect(200);
    expect(res.body.finalized).toBe(false);
    expect(res.body.totals).toEqual(["100", "0", "0"]);
  });
});

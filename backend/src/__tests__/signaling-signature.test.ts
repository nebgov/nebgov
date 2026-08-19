import { Keypair } from "@stellar/stellar-sdk";
import { canonicalSignalPayload, verifySignalVote, type SignalVotePayload } from "../signaling/signature";

function sign(keypair: Keypair, payload: SignalVotePayload): string {
  const digestHex = canonicalSignalPayload(payload);
  return keypair.sign(Buffer.from(digestHex, "utf8")).toString("base64");
}

describe("signaling signature verification", () => {
  it("accepts a valid signature from the claimed voter", () => {
    const voter = Keypair.random();
    const payload: SignalVotePayload = {
      pollId: 1,
      choiceIndex: 0,
      voterAddress: voter.publicKey(),
      nonce: "nonce-1",
    };

    const signature = sign(voter, payload);

    expect(verifySignalVote(payload, signature)).toBe(true);
  });

  it("rejects a tampered choiceIndex after signing", () => {
    const voter = Keypair.random();
    const original: SignalVotePayload = {
      pollId: 1,
      choiceIndex: 0,
      voterAddress: voter.publicKey(),
      nonce: "nonce-1",
    };
    const signature = sign(voter, original);

    const tampered: SignalVotePayload = { ...original, choiceIndex: 1 };

    expect(verifySignalVote(tampered, signature)).toBe(false);
  });

  it("rejects a signature from a different keypair than the claimed voter_address", () => {
    const voter = Keypair.random();
    const impostor = Keypair.random();
    const payload: SignalVotePayload = {
      pollId: 1,
      choiceIndex: 0,
      voterAddress: voter.publicKey(),
      nonce: "nonce-1",
    };

    const signature = sign(impostor, payload);

    expect(verifySignalVote(payload, signature)).toBe(false);
  });

  it("treats the same nonce as independently valid across two different polls", () => {
    const voter = Keypair.random();
    const payloadPollA: SignalVotePayload = {
      pollId: 1,
      choiceIndex: 0,
      voterAddress: voter.publicKey(),
      nonce: "shared-nonce",
    };
    const payloadPollB: SignalVotePayload = {
      pollId: 2,
      choiceIndex: 0,
      voterAddress: voter.publicKey(),
      nonce: "shared-nonce",
    };

    const signatureA = sign(voter, payloadPollA);
    const signatureB = sign(voter, payloadPollB);

    expect(verifySignalVote(payloadPollA, signatureA)).toBe(true);
    expect(verifySignalVote(payloadPollB, signatureB)).toBe(true);
    // A signature for one poll's payload must not verify against the other poll's payload.
    expect(verifySignalVote(payloadPollB, signatureA)).toBe(false);
  });

  it("rejects a malformed voter address without throwing", () => {
    const payload: SignalVotePayload = {
      pollId: 1,
      choiceIndex: 0,
      voterAddress: "not-a-valid-address",
      nonce: "nonce-1",
    };

    expect(() => verifySignalVote(payload, "AAAA")).not.toThrow();
    expect(verifySignalVote(payload, "AAAA")).toBe(false);
  });
});

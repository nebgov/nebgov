import crypto from "crypto";
import { Keypair } from "@stellar/stellar-sdk";

/**
 * A real cryptographic check, not merely trusting the submitted address —
 * see `backend/src/routes/auth.ts`'s `/login`, which accepts a bare
 * `wallet_address` with no signature verification at all. Signaling
 * integrity depends on this actually being checked.
 */
export interface SignalVotePayload {
  pollId: number;
  choiceIndex: number;
  voterAddress: string;
  nonce: string;
}

const DOMAIN_TAG = "nebgov-signal";

/**
 * Canonical, unambiguous hex digest for a signaling vote:
 * hex(SHA256("nebgov-signal" || poll_id || choice || voter_address ||
 * nonce)). Fields are joined with "|" separators so no field boundary can be
 * ambiguously reinterpreted (e.g. pollId=1,choice=23 vs pollId=12,choice=3).
 *
 * Returned (and signed) as a **hex string**, not raw digest bytes — a wallet
 * extension's SEP-43 `signMessage(message: string)` only accepts a string,
 * so both the wallet-signing path (`app/src/lib/wallet-context.tsx`'s
 * `signMessage`) and the raw-{@link Keypair}-signing path
 * (`sdk/src/signaling.ts`'s `castVote`) sign the identical UTF-8 bytes of
 * this hex string, keeping verification uniform across both.
 */
export function canonicalSignalPayload(payload: SignalVotePayload): string {
  const message = [
    DOMAIN_TAG,
    String(payload.pollId),
    String(payload.choiceIndex),
    payload.voterAddress,
    payload.nonce,
  ].join("|");
  return crypto.createHash("sha256").update(message, "utf8").digest("hex");
}

/**
 * Verifies `signature` (base64) was produced by `payload.voterAddress`'s
 * Stellar keypair signing the UTF-8 bytes of `canonicalSignalPayload(payload)`.
 * Returns false (never throws) for any malformed address, signature, or
 * verification failure, so callers can treat this as a simple boolean gate.
 */
export function verifySignalVote(payload: SignalVotePayload, signatureBase64: string): boolean {
  try {
    const digestHex = canonicalSignalPayload(payload);
    const signature = Buffer.from(signatureBase64, "base64");
    const keypair = Keypair.fromPublicKey(payload.voterAddress);
    return keypair.verify(Buffer.from(digestHex, "utf8"), signature);
  } catch {
    return false;
  }
}

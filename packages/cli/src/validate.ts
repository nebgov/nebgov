import { VoteSupport, VoteType } from "@nebgov/sdk";
import { StrKey } from "@stellar/stellar-sdk";
import { readFile } from "node:fs/promises";
import { resolvePath } from "./config.js";

const U32_MAX = 4_294_967_295n;
const U64_MAX = 2n ** 64n - 1n;
const I128_MAX = 2n ** 127n - 1n;

/** An account (`G...`) or contract (`C...`) address. */
export function parseAddress(value: string, field: string): string {
  const address = value.trim();
  if (StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address)) {
    return address;
  }
  throw new Error(`${field} must be a Stellar account (G...) or contract (C...) address, got "${value}"`);
}

/** A contract (`C...`) address. */
export function parseContractAddress(value: string, field: string): string {
  const address = value.trim();
  if (StrKey.isValidContract(address)) return address;
  throw new Error(`${field} must be a Stellar contract (C...) address, got "${value}"`);
}

function parseUnsigned(value: string, field: string, max: bigint): bigint {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${field} must be a non-negative integer, got "${value}"`);
  }
  const parsed = BigInt(trimmed);
  if (parsed > max) {
    throw new Error(`${field} must be at most ${max}, got ${trimmed}`);
  }
  return parsed;
}

export function parseU32(value: string, field: string): number {
  return Number(parseUnsigned(value, field, U32_MAX));
}

export function parseU64(value: string, field: string): bigint {
  return parseUnsigned(value, field, U64_MAX);
}

/** A non-negative i128 token amount. */
export function parseAmount(value: string, field: string): bigint {
  return parseUnsigned(value, field, I128_MAX);
}

/** A numeric id for SDK clients that take `number` ids. */
export function parseId(value: string, field: string): number {
  return Number(parseUnsigned(value, field, BigInt(Number.MAX_SAFE_INTEGER)));
}

export function parsePositiveInt(value: string, field: string): number {
  const parsed = parseId(value, field);
  if (parsed < 1) throw new Error(`${field} must be at least 1, got ${value}`);
  return parsed;
}

export function parseChoice<T extends string>(value: string, field: string, choices: readonly T[]): T {
  const match = choices.find((choice) => choice.toLowerCase() === value.trim().toLowerCase());
  if (!match) throw new Error(`${field} must be one of: ${choices.join(", ")} (got "${value}")`);
  return match;
}

export function parseHex(value: string | undefined, field: string): Buffer {
  const hex = (value ?? "").trim().replace(/^0x/i, "");
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) {
    throw new Error(`${field} must be an even-length hex string, got "${value}"`);
  }
  return Buffer.from(hex, "hex");
}

/** A Soroban function name (symbol): 1–32 characters of `[A-Za-z0-9_]`. */
export function parseFunctionName(value: string, field: string): string {
  if (!/^[A-Za-z0-9_]{1,32}$/.test(value)) {
    throw new Error(`${field} must be 1-32 characters of [A-Za-z0-9_], got "${value}"`);
  }
  return value;
}

export function parseVoteSupport(input: string): VoteSupport {
  const normalized = input.toLowerCase();
  if (normalized === "for") return VoteSupport.For;
  if (normalized === "against") return VoteSupport.Against;
  if (normalized === "abstain") return VoteSupport.Abstain;
  throw new Error("support must be one of: for, against, abstain");
}

export function parseVoteType(input: string): VoteType {
  const normalized = input.toLowerCase();
  if (normalized === "simple") return VoteType.Simple;
  if (normalized === "extended") return VoteType.Extended;
  if (normalized === "quadratic") return VoteType.Quadratic;
  throw new Error("vote-type must be one of: simple, extended, quadratic");
}

export type Recipient = { address: string; amount: bigint };

/**
 * Parse `address,amount` rows. Blank lines, `#` comments and an optional
 * `address,amount` header are skipped; any other malformed row is an error,
 * so a typo never silently drops a transfer.
 */
export async function parseRecipientsCsv(filePathRaw: string): Promise<Recipient[]> {
  const text = await readFile(resolvePath(filePathRaw), "utf8");
  const out: Recipient[] = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNo = index + 1;
    if (line.length === 0 || line.startsWith("#")) return;

    const parts = line.split(",").map((part) => part.trim());
    if (out.length === 0 && parts[0]?.toLowerCase() === "address" && parts[1]?.toLowerCase() === "amount") {
      return;
    }
    if (parts.length !== 2) {
      throw new Error(`recipients line ${lineNo}: expected "address,amount", got "${line}"`);
    }

    const address = parseAddress(parts[0], `recipients line ${lineNo} address`);
    const amount = parseAmount(parts[1], `recipients line ${lineNo} amount`);
    if (amount === 0n) throw new Error(`recipients line ${lineNo} amount must be greater than 0`);
    out.push({ address, amount });
  });

  return out;
}

import { VoteSupport, VoteType } from "@nebgov/sdk";
import {
  parseAddress,
  parseAmount,
  parseChoice,
  parseContractAddress,
  parseFunctionName,
  parseHex,
  parseId,
  parsePositiveInt,
  parseRecipientsCsv,
  parseU32,
  parseU64,
  parseVoteSupport,
  parseVoteType,
} from "../validate";
import { ACCOUNT, OTHER_ACCOUNT, TOKEN, useCleanEnvironment, writeTemp } from "./helpers";

useCleanEnvironment();

describe("address validation", () => {
  it("accepts account and contract addresses, trimming whitespace", () => {
    expect(parseAddress(ACCOUNT, "to")).toBe(ACCOUNT);
    expect(parseAddress(` ${TOKEN} `, "to")).toBe(TOKEN);
  });

  it("rejects malformed addresses and names the field", () => {
    expect(() => parseAddress("GABC", "delegatee")).toThrow(/delegatee must be a Stellar account/);
    expect(() => parseAddress(ACCOUNT.slice(0, -1) + "A", "to")).toThrow(/must be a Stellar/);
    expect(() => parseAddress("", "to")).toThrow(/must be a Stellar/);
  });

  it("only accepts C... addresses where a contract is required", () => {
    expect(parseContractAddress(TOKEN, "token")).toBe(TOKEN);
    expect(() => parseContractAddress(ACCOUNT, "token")).toThrow(/token must be a Stellar contract/);
  });
});

describe("integer validation", () => {
  it("parses u32 within range and rejects overflow", () => {
    expect(parseU32("0", "delay")).toBe(0);
    expect(parseU32("4294967295", "delay")).toBe(4_294_967_295);
    expect(() => parseU32("4294967296", "delay")).toThrow(/delay must be at most 4294967295/);
  });

  it("parses u64 ids as bigint", () => {
    expect(parseU64("18446744073709551615", "id")).toBe(18_446_744_073_709_551_615n);
    expect(() => parseU64("18446744073709551616", "id")).toThrow(/at most/);
  });

  it.each(["-1", "1.5", "1e3", "abc", "", "0x10"])("rejects %p as an integer", (value) => {
    expect(() => parseU64(value, "id")).toThrow(/id must be a non-negative integer/);
    expect(() => parseId(value, "id")).toThrow(/id must be a non-negative integer/);
  });

  it("parses i128 amounts", () => {
    expect(parseAmount("170141183460469231731687303715884105727", "amount")).toBe(2n ** 127n - 1n);
    expect(() => parseAmount("170141183460469231731687303715884105728", "amount")).toThrow(/at most/);
  });

  it("requires positive limits", () => {
    expect(parsePositiveInt("5", "limit")).toBe(5);
    expect(() => parsePositiveInt("0", "limit")).toThrow(/limit must be at least 1/);
  });
});

describe("calldata and function names", () => {
  it("decodes hex with or without a 0x prefix, and defaults to empty", () => {
    expect(parseHex("0xdeadBEEF", "calldata").toString("hex")).toBe("deadbeef");
    expect(parseHex("00ff", "calldata")).toEqual(Buffer.from([0, 255]));
    expect(parseHex(undefined, "calldata")).toHaveLength(0);
  });

  it("rejects odd-length and non-hex calldata instead of silently truncating it", () => {
    expect(() => parseHex("abc", "calldata-hex")).toThrow(/calldata-hex must be an even-length hex string/);
    expect(() => parseHex("zz", "calldata-hex")).toThrow(/even-length hex/);
  });

  it("accepts Soroban symbols only", () => {
    expect(parseFunctionName("set_rate_2", "fn")).toBe("set_rate_2");
    expect(() => parseFunctionName("set-rate", "fn")).toThrow(/fn must be 1-32 characters/);
    expect(() => parseFunctionName("a".repeat(33), "fn")).toThrow(/1-32 characters/);
    expect(() => parseFunctionName("", "fn")).toThrow(/1-32 characters/);
  });
});

describe("enumerated choices", () => {
  it("maps vote support case-insensitively", () => {
    expect(parseVoteSupport("FOR")).toBe(VoteSupport.For);
    expect(parseVoteSupport("against")).toBe(VoteSupport.Against);
    expect(parseVoteSupport("Abstain")).toBe(VoteSupport.Abstain);
    expect(() => parseVoteSupport("yes")).toThrow("support must be one of: for, against, abstain");
  });

  it("maps vote types", () => {
    expect(parseVoteType("simple")).toBe(VoteType.Simple);
    expect(parseVoteType("Extended")).toBe(VoteType.Extended);
    expect(parseVoteType("QUADRATIC")).toBe(VoteType.Quadratic);
    expect(() => parseVoteType("ranked")).toThrow(/vote-type must be one of/);
  });

  it("returns the canonical spelling of a choice", () => {
    expect(parseChoice("challengewindow", "status", ["ChallengeWindow", "Passed"])).toBe("ChallengeWindow");
    expect(() => parseChoice("open", "status", ["active", "closed"])).toThrow(
      'status must be one of: active, closed (got "open")',
    );
  });
});

describe("parseRecipientsCsv", () => {
  it("parses rows, skipping blanks, comments and an address,amount header", async () => {
    const file = writeTemp(
      "recipients.csv",
      `address,amount\n# team payouts\n${ACCOUNT}, 100\r\n\n${TOKEN},25\n`,
    );
    await expect(parseRecipientsCsv(file)).resolves.toEqual([
      { address: ACCOUNT, amount: 100n },
      { address: TOKEN, amount: 25n },
    ]);
  });

  it("reports the line number of a malformed row instead of skipping it", async () => {
    const file = writeTemp("missing-amount.csv", `${ACCOUNT},10\n${OTHER_ACCOUNT}\n`);
    await expect(parseRecipientsCsv(file)).rejects.toThrow(/recipients line 2: expected "address,amount"/);
  });

  it("rejects invalid addresses, non-integer and zero amounts", async () => {
    await expect(parseRecipientsCsv(writeTemp("bad-address.csv", "GNOPE,10\n"))).rejects.toThrow(
      /recipients line 1 address must be a Stellar/,
    );
    await expect(parseRecipientsCsv(writeTemp("bad-amount.csv", `${ACCOUNT},1.5\n`))).rejects.toThrow(
      /recipients line 1 amount must be a non-negative integer/,
    );
    await expect(parseRecipientsCsv(writeTemp("zero.csv", `${ACCOUNT},0\n`))).rejects.toThrow(
      /recipients line 1 amount must be greater than 0/,
    );
  });

  it("only treats the first row as a header", async () => {
    const file = writeTemp("late-header.csv", `${ACCOUNT},10\naddress,amount\n`);
    await expect(parseRecipientsCsv(file)).rejects.toThrow(/recipients line 2 address/);
  });
});

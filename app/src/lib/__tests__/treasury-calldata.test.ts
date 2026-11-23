/**
 * @jest-environment node
 */

import { StrKey, scValToNative, xdr } from "@stellar/stellar-sdk";
import {
  calldataArgRowToScVal,
  encodeCallableCalldata,
  encodeDeactivateStrategyCalldata,
  encodeGovernorCalldataBytes,
  encodeRegisterStrategyCalldata,
  labelPendingTx,
  newArgRow,
  previewCalldata,
  type CalldataArgRow,
} from "../treasury-calldata";

const ACCOUNT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const OTHER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2));
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 3));

function row(kind: CalldataArgRow["kind"], value: string): CalldataArgRow {
  return { id: `${kind}:${value}`, kind, value };
}

/** Decodes produced calldata back into native values, the way the contract's ScVec reads it. */
function decodeVec(bytes: Uint8Array): unknown[] {
  const native = scValToNative(xdr.ScVal.fromXDR(Buffer.from(bytes)));
  if (!Array.isArray(native)) {
    throw new Error("expected an ScVec");
  }
  return native;
}

/** Mirrors the module's abbreviation for addresses longer than 12 characters. */
function abbreviate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

describe("newArgRow", () => {
  it("starts as an empty address row with a unique id", () => {
    const first = newArgRow();
    const second = newArgRow();

    expect(first).toMatchObject({ kind: "address", value: "" });
    expect(first.id).not.toBe("");
    expect(first.id).not.toBe(second.id);
  });
});

describe("calldataArgRowToScVal", () => {
  it("encodes addresses, trimming surrounding whitespace", () => {
    expect(scValToNative(calldataArgRowToScVal(row("address", `  ${ACCOUNT}  `)))).toBe(
      ACCOUNT,
    );
  });

  it("encodes i128 values beyond 64 bits and negative values", () => {
    expect(
      scValToNative(calldataArgRowToScVal(row("i128", "1000000000000000000000"))),
    ).toBe(1000000000000000000000n);
    expect(scValToNative(calldataArgRowToScVal(row("i128", "-42")))).toBe(-42n);
  });

  it("treats an empty i128 as zero", () => {
    expect(scValToNative(calldataArgRowToScVal(row("i128", "")))).toBe(0n);
  });

  it("encodes the full u64 range", () => {
    expect(
      scValToNative(calldataArgRowToScVal(row("u64", "18446744073709551615"))),
    ).toBe(18446744073709551615n);
  });

  it("encodes strings with surrounding whitespace removed", () => {
    expect(scValToNative(calldataArgRowToScVal(row("string", "  hello  ")))).toBe(
      "hello",
    );
  });

  it.each([
    ["true", true],
    ["1", true],
    ["false", false],
    ["yes", false],
    ["", false],
  ])("encodes bool input %p as %p", (input, expected) => {
    expect(scValToNative(calldataArgRowToScVal(row("bool", input)))).toBe(expected);
  });
});

describe("encodeCallableCalldata", () => {
  it("rejects a blank function name", () => {
    expect(() => encodeCallableCalldata("   ", [row("u64", "1")])).toThrow(
      "Function name is required.",
    );
  });

  it("returns no bytes when no argument has a value", () => {
    expect(encodeCallableCalldata("transfer", [row("address", "  ")])).toHaveLength(0);
  });

  it("encodes non-empty arguments in order and skips blank ones", () => {
    const bytes = encodeCallableCalldata("transfer", [
      row("address", ACCOUNT),
      row("string", ""),
      row("i128", "250"),
    ]);

    expect(decodeVec(bytes)).toEqual([ACCOUNT, 250n]);
  });
});

describe("encodeGovernorCalldataBytes", () => {
  it("encodes the argument vector without a function name", () => {
    const bytes = encodeGovernorCalldataBytes([row("bool", "true"), row("string", "memo")]);

    expect(decodeVec(bytes)).toEqual([true, "memo"]);
  });

  it("returns no bytes for an empty argument list", () => {
    expect(encodeGovernorCalldataBytes([])).toHaveLength(0);
  });
});

describe("encodeRegisterStrategyCalldata", () => {
  it("encodes register_strategy arguments in contract order", () => {
    const bytes = encodeRegisterStrategyCalldata(CONTRACT, OTHER, ACCOUNT, 2500, 1000);

    expect(decodeVec(bytes)).toEqual([CONTRACT, OTHER, ACCOUNT, 2500, 1000]);
  });
});

describe("encodeDeactivateStrategyCalldata", () => {
  it("encodes deactivate_strategy arguments in contract order", () => {
    const [admin, strategyId] = decodeVec(encodeDeactivateStrategyCalldata(CONTRACT, 7));

    expect(admin).toBe(CONTRACT);
    expect(BigInt(strategyId as bigint | number)).toBe(7n);
  });
});

describe("previewCalldata", () => {
  it("describes the call with quoted strings and skips blank arguments", () => {
    expect(
      previewCalldata(CONTRACT, "transfer", [
        row("address", ACCOUNT),
        row("i128", "100"),
        row("string", "memo"),
        row("bool", " "),
      ]),
    ).toBe(`This will call transfer(${ACCOUNT}, 100, "memo") on ${CONTRACT}`);
  });

  it("uses ellipses when the target and function are blank", () => {
    expect(previewCalldata("  ", "", [])).toBe("This will call …() on …");
  });
});

describe("labelPendingTx", () => {
  const pendingData = Buffer.from(
    encodeGovernorCalldataBytes([row("address", OTHER), row("i128", "500")]),
  ).toString("hex");

  it("labels a transfer with its amount and recipient", () => {
    expect(labelPendingTx(CONTRACT, pendingData, "transfer")).toBe(
      `Transfer 500 to ${abbreviate(OTHER)} · ${abbreviate(CONTRACT)}`,
    );
  });

  it("labels other functions with their full decoded arguments", () => {
    expect(labelPendingTx(CONTRACT, pendingData, "mint")).toBe(
      `mint(${OTHER}, 500) · ${abbreviate(CONTRACT)}`,
    );
  });

  it("accepts hex calldata with a 0x prefix", () => {
    expect(labelPendingTx(CONTRACT, `0x${pendingData}`, "transfer")).toBe(
      labelPendingTx(CONTRACT, pendingData, "transfer"),
    );
  });

  it("falls back to a bare call when the calldata cannot be decoded", () => {
    expect(labelPendingTx(CONTRACT, "zz", "pause")).toBe(`pause() · ${abbreviate(CONTRACT)}`);
  });

  it("labels a function call that carries no calldata", () => {
    expect(labelPendingTx(CONTRACT, "", "pause")).toBe(`pause() · ${abbreviate(CONTRACT)}`);
  });

  it("labels calldata without a function name as custom calldata", () => {
    expect(labelPendingTx(CONTRACT, pendingData)).toBe(
      `Custom calldata · ${abbreviate(CONTRACT)}`,
    );
  });

  it("labels an action with neither calldata nor a function as a custom action", () => {
    expect(labelPendingTx(CONTRACT, "", "")).toBe(`Custom action · ${abbreviate(CONTRACT)}`);
  });

  it("does not abbreviate targets of 12 characters or fewer", () => {
    expect(labelPendingTx("SHORTTARGET1", "", "pause")).toBe("pause() · SHORTTARGET1");
  });
});

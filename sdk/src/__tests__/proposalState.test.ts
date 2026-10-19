import { xdr } from "@stellar/stellar-sdk";
import { decodeProposalState } from "../governor";
import { ProposalState, UnknownProposalStateError } from "../types";

/** A Soroban unit-variant enum is encoded as a one-element vector holding the variant symbol. */
const variantScVal = (name: string): xdr.ScVal => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]);

describe("decodeProposalState", () => {
  // Mirrors `ProposalState` in contracts/governor/src/lib.rs.
  const contractVariants = [
    "Pending",
    "Active",
    "Defeated",
    "Succeeded",
    "Queued",
    "Executed",
    "Cancelled",
    "Expired",
  ] as const;

  it.each(contractVariants)("decodes %s to the matching ProposalState", (name) => {
    expect(decodeProposalState(variantScVal(name))).toBe(ProposalState[name]);
  });

  it("covers every ProposalState member", () => {
    expect([...contractVariants].sort()).toEqual(Object.values(ProposalState).sort());
  });

  it("throws UnknownProposalStateError for an unrecognized variant", () => {
    const decode = () => decodeProposalState(variantScVal("Mystery"));
    expect(decode).toThrow(UnknownProposalStateError);
    expect(decode).toThrow("Unknown proposal state: Mystery");
  });

  it("throws for a value that is not a vector-wrapped symbol", () => {
    expect(() => decodeProposalState(xdr.ScVal.scvSymbol("Active"))).toThrow(
      "Invalid ScVal format for ProposalState enum",
    );
  });
});

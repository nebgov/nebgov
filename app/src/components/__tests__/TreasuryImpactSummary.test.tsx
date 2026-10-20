import React from "react";
import renderer from "react-test-renderer";
import { TreasuryImpactSummary } from "../TreasuryImpactSummary";

describe("TreasuryImpactSummary", () => {
  it("renders unrestricted message when before cap is null", () => {
    const impact = {
      token: "USDC",
      capRemainingBefore: null,
      capRemainingAfter: null,
    };
    const tree = renderer
      .create(<TreasuryImpactSummary impact={impact} />)
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("renders spending cap bar when both cap values exist", () => {
    const impact = {
      token: "USDC",
      capRemainingBefore: 10000n,
      capRemainingAfter: 5000n,
    };
    const tree = renderer
      .create(<TreasuryImpactSummary impact={impact} />)
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("displays cap values with correct formatting", () => {
    const impact = {
      token: "USDC",
      capRemainingBefore: 10000n,
      capRemainingAfter: 5000n,
    };
    const tree = renderer
      .create(<TreasuryImpactSummary impact={impact} />)
      .root;

    const text = tree.findByType("span").children;
    expect(JSON.stringify(text)).toContain("10000");
  });

  it("shows normal styling when action does not exceed cap", () => {
    const impact = {
      token: "USDC",
      capRemainingBefore: 10000n,
      capRemainingAfter: 5000n,
    };
    const tree = renderer
      .create(<TreasuryImpactSummary impact={impact} />)
      .root;

    const bars = tree.findAllByType("div");
    const filledBar = bars.find((bar) =>
      bar.props.className?.includes("bg-indigo-500")
    );
    expect(filledBar).toBeDefined();
  });

  it("shows error styling when action exceeds cap", () => {
    const impact = {
      token: "USDC",
      capRemainingBefore: 10000n,
      capRemainingAfter: -1000n,
    };
    const tree = renderer
      .create(<TreasuryImpactSummary impact={impact} />)
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("displays warning message when cap is exceeded", () => {
    const impact = {
      token: "USDC",
      capRemainingBefore: 10000n,
      capRemainingAfter: -1000n,
    };
    const tree = renderer
      .create(<TreasuryImpactSummary impact={impact} />)
      .root;

    expect(tree.findByType("p").props.children).toContain("exceed");
  });

  it("handles zero cap remaining before action", () => {
    const impact = {
      token: "USDC",
      capRemainingBefore: 0n,
      capRemainingAfter: -100n,
    };
    const tree = renderer
      .create(<TreasuryImpactSummary impact={impact} />)
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("handles negative cap remaining after action", () => {
    const impact = {
      token: "USDC",
      capRemainingBefore: 5000n,
      capRemainingAfter: -5000n,
    };
    const tree = renderer
      .create(<TreasuryImpactSummary impact={impact} />)
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("displays token symbol in header", () => {
    const impact = {
      token: "BTC",
      capRemainingBefore: 10000n,
      capRemainingAfter: 5000n,
    };
    const tree = renderer
      .create(<TreasuryImpactSummary impact={impact} />)
      .root;

    const text = tree.findAllByType("span")[0].children;
    expect(JSON.stringify(text)).toContain("BTC");
  });

  it("calculates percentage correctly for half remaining", () => {
    const impact = {
      token: "USDC",
      capRemainingBefore: 1000n,
      capRemainingAfter: 500n,
    };
    const tree = renderer
      .create(<TreasuryImpactSummary impact={impact} />)
      .toJSON();
    expect(tree).toMatchSnapshot();
  });
});

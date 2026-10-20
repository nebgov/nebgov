import React from "react";
import renderer from "react-test-renderer";
import { StrategyPerformanceChart } from "../StrategyPerformanceChart";

describe("StrategyPerformanceChart", () => {
  it("renders message when points array is empty", () => {
    const tree = renderer
      .create(<StrategyPerformanceChart points={[]} />)
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("renders message when points array has only one point", () => {
    const tree = renderer
      .create(
        <StrategyPerformanceChart
          points={[{ amount: 1000n, ledger: 100 }]}
        />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("renders SVG sparkline with two points", () => {
    const tree = renderer
      .create(
        <StrategyPerformanceChart
          points={[
            { amount: 1000n, ledger: 100 },
            { amount: 2000n, ledger: 101 },
          ]}
        />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("renders SVG sparkline with multiple points", () => {
    const tree = renderer
      .create(
        <StrategyPerformanceChart
          points={[
            { amount: 1000n, ledger: 100 },
            { amount: 1500n, ledger: 101 },
            { amount: 2000n, ledger: 102 },
            { amount: 1800n, ledger: 103 },
            { amount: 2500n, ledger: 104 },
          ]}
        />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("uses custom label when provided", () => {
    const customLabel = "Custom Principal History";
    const tree = renderer
      .create(
        <StrategyPerformanceChart
          points={[
            { amount: 1000n, ledger: 100 },
            { amount: 2000n, ledger: 101 },
          ]}
          label={customLabel}
        />
      )
      .root;

    const svg = tree.findByType("svg");
    expect(svg.props["aria-label"]).toBe(customLabel);
  });

  it("uses default label when not provided", () => {
    const tree = renderer
      .create(
        <StrategyPerformanceChart
          points={[
            { amount: 1000n, ledger: 100 },
            { amount: 2000n, ledger: 101 },
          ]}
        />
      )
      .root;

    const svg = tree.findByType("svg");
    expect(svg.props["aria-label"]).toBe("Principal deposited over time");
  });

  it("handles equal values across all points", () => {
    const tree = renderer
      .create(
        <StrategyPerformanceChart
          points={[
            { amount: 1000n, ledger: 100 },
            { amount: 1000n, ledger: 101 },
            { amount: 1000n, ledger: 102 },
          ]}
        />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("handles large bigint values", () => {
    const tree = renderer
      .create(
        <StrategyPerformanceChart
          points={[
            { amount: BigInt("999999999999999"), ledger: 100 },
            { amount: BigInt("1000000000000000"), ledger: 101 },
          ]}
        />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });
});

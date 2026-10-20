import React from "react";
import renderer from "react-test-renderer";
import { render, screen } from "@testing-library/react";
import type { SimulationResult } from "@nebgov/sdk";

jest.mock("../TreasuryImpactSummary", () => ({
  TreasuryImpactSummary: ({ impact }: any) => (
    <div data-testid="treasury-impact">Treasury Impact: {impact?.amount}</div>
  ),
}));

import { ProposalImpactPreview } from "../ProposalImpactPreview";

describe("ProposalImpactPreview", () => {
  it("renders loading state", () => {
    const tree = renderer
      .create(
        <ProposalImpactPreview results={null} loading={true} error={null} />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("displays loading message", () => {
    render(
      <ProposalImpactPreview results={null} loading={true} error={null} />
    );

    expect(
      screen.getByText(/Simulating proposal actions against current chain state/i)
    ).toBeInTheDocument();
  });

  it("renders error state", () => {
    const tree = renderer
      .create(
        <ProposalImpactPreview
          results={null}
          loading={false}
          error="Contract call failed"
        />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("displays error message", () => {
    render(
      <ProposalImpactPreview
        results={null}
        loading={false}
        error="Contract call failed"
      />
    );

    expect(
      screen.getByText(/Could not simulate this proposal: Contract call failed/i)
    ).toBeInTheDocument();
  });

  it("renders no actions message when results empty", () => {
    render(
      <ProposalImpactPreview
        results={[]}
        loading={false}
        error={null}
      />
    );

    expect(
      screen.getByText(/No on-chain actions to preview/i)
    ).toBeInTheDocument();
  });

  it("renders no actions message when results null", () => {
    render(
      <ProposalImpactPreview
        results={null}
        loading={false}
        error={null}
      />
    );

    expect(
      screen.getByText(/No on-chain actions to preview/i)
    ).toBeInTheDocument();
  });

  it("renders successful action results", () => {
    const results: SimulationResult[] = [
      {
        success: true,
        decodedSummary: "Transfer 100 XLM to treasury",
        revertReason: null,
        treasuryImpact: null,
      } as SimulationResult,
    ];

    render(
      <ProposalImpactPreview
        results={results}
        loading={false}
        error={null}
      />
    );

    expect(
      screen.getByText("Transfer 100 XLM to treasury")
    ).toBeInTheDocument();
  });

  it("renders failed action results with revert reason", () => {
    const results: SimulationResult[] = [
      {
        success: false,
        decodedSummary: "Mint governance token",
        revertReason: "Insufficient balance",
        treasuryImpact: null,
      } as SimulationResult,
    ];

    render(
      <ProposalImpactPreview
        results={results}
        loading={false}
        error={null}
      />
    );

    expect(
      screen.getByText("Mint governance token")
    ).toBeInTheDocument();
    expect(screen.getByText("Insufficient balance")).toBeInTheDocument();
  });

  it("displays warning when any action would revert", () => {
    const results: SimulationResult[] = [
      {
        success: true,
        decodedSummary: "Action 1 passes",
        revertReason: null,
        treasuryImpact: null,
      } as SimulationResult,
      {
        success: false,
        decodedSummary: "Action 2 fails",
        revertReason: "Error occurred",
        treasuryImpact: null,
      } as SimulationResult,
    ];

    render(
      <ProposalImpactPreview
        results={results}
        loading={false}
        error={null}
      />
    );

    expect(
      screen.getByText(
        /At least one action would fail to execute — this proposal cannot succeed/i
      )
    ).toBeInTheDocument();
  });

  it("does not display warning when all actions succeed", () => {
    const results: SimulationResult[] = [
      {
        success: true,
        decodedSummary: "Action 1 passes",
        revertReason: null,
        treasuryImpact: null,
      } as SimulationResult,
      {
        success: true,
        decodedSummary: "Action 2 passes",
        revertReason: null,
        treasuryImpact: null,
      } as SimulationResult,
    ];

    render(
      <ProposalImpactPreview
        results={results}
        loading={false}
        error={null}
      />
    );

    expect(
      screen.queryByText(/At least one action would fail/i)
    ).not.toBeInTheDocument();
  });

  it("displays treasury impact when present", () => {
    const results: SimulationResult[] = [
      {
        success: true,
        decodedSummary: "Transfer tokens",
        revertReason: null,
        treasuryImpact: { amount: "1000" } as any,
      } as SimulationResult,
    ];

    render(
      <ProposalImpactPreview
        results={results}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByTestId("treasury-impact")).toBeInTheDocument();
  });

  it("renders multiple action results", () => {
    const results: SimulationResult[] = [
      {
        success: true,
        decodedSummary: "Action 1",
        revertReason: null,
        treasuryImpact: null,
      } as SimulationResult,
      {
        success: true,
        decodedSummary: "Action 2",
        revertReason: null,
        treasuryImpact: null,
      } as SimulationResult,
      {
        success: true,
        decodedSummary: "Action 3",
        revertReason: null,
        treasuryImpact: null,
      } as SimulationResult,
    ];

    render(
      <ProposalImpactPreview
        results={results}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText("Action 1")).toBeInTheDocument();
    expect(screen.getByText("Action 2")).toBeInTheDocument();
    expect(screen.getByText("Action 3")).toBeInTheDocument();
  });

  it("matches snapshot for complete results", () => {
    const results: SimulationResult[] = [
      {
        success: true,
        decodedSummary: "Successful action",
        revertReason: null,
        treasuryImpact: null,
      } as SimulationResult,
      {
        success: false,
        decodedSummary: "Failed action",
        revertReason: "Transaction reverted",
        treasuryImpact: null,
      } as SimulationResult,
    ];

    const tree = renderer
      .create(
        <ProposalImpactPreview
          results={results}
          loading={false}
          error={null}
        />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("handles result with long decoded summary", () => {
    const longSummary =
      "Transfer 1000000 XLM from Treasury to Governance Pool with approval from multisig account and execution through timelock contract";

    const results: SimulationResult[] = [
      {
        success: true,
        decodedSummary: longSummary,
        revertReason: null,
        treasuryImpact: null,
      } as SimulationResult,
    ];

    render(
      <ProposalImpactPreview
        results={results}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText(longSummary)).toBeInTheDocument();
  });

  it("handles result with long revert reason", () => {
    const longRevertReason =
      "This contract invocation failed because the required minimum balance for the account was not met at the time of execution";

    const results: SimulationResult[] = [
      {
        success: false,
        decodedSummary: "Failed action",
        revertReason: longRevertReason,
        treasuryImpact: null,
      } as SimulationResult,
    ];

    render(
      <ProposalImpactPreview
        results={results}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText(longRevertReason)).toBeInTheDocument();
  });
});

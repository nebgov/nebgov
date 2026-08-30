import { describe, it, expect } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";
import { AmendmentTimeline } from "@/components/AmendmentTimeline";
import type { ProposalAmendment } from "@nebgov/sdk/amendments";

describe("AmendmentTimeline", () => {
  const mockAmendments: ProposalAmendment[] = [
    {
      id: 0,
      proposal_id: 123,
      version: 0,
      amended_by: "GAAAA...",
      amended_at: "2026-08-30T00:00:00Z",
      description: "Original description",
      target_address: null,
      function_name: null,
      calldata_hex: null,
      reason: "Original proposal",
      created_at: "2026-08-30T00:00:00Z",
    },
    {
      id: 1,
      proposal_id: 123,
      version: 1,
      amended_by: "GAAAA...",
      amended_at: "2026-08-30T12:00:00Z",
      description: "Updated description",
      target_address: null,
      function_name: null,
      calldata_hex: null,
      reason: "Fixed typo",
      created_at: "2026-08-30T12:00:00Z",
    },
  ];

  it("should render amendments timeline", () => {
    render(
      <AmendmentTimeline
        amendments={mockAmendments}
        currentVersion={1}
        isProposer={false}
        isPending={true}
        diff={null}
      />,
    );

    expect(screen.getByText("Amendment Timeline")).toBeInTheDocument();
    expect(screen.getByText(/v0/)).toBeInTheDocument();
    expect(screen.getByText(/v1/)).toBeInTheDocument();
  });

  it("should show current version badge", () => {
    render(
      <AmendmentTimeline
        amendments={mockAmendments}
        currentVersion={1}
        isProposer={false}
        isPending={true}
        diff={null}
      />,
    );

    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("should show amendment form for proposer", () => {
    render(
      <AmendmentTimeline
        amendments={mockAmendments}
        currentVersion={1}
        isProposer={true}
        isPending={true}
        diff={null}
      />,
    );

    expect(screen.getByText("+ Create Amendment")).toBeInTheDocument();
  });

  it("should not show amendment form for non-proposer", () => {
    render(
      <AmendmentTimeline
        amendments={mockAmendments}
        currentVersion={1}
        isProposer={false}
        isPending={true}
        diff={null}
      />,
    );

    expect(screen.queryByText("+ Create Amendment")).not.toBeInTheDocument();
  });

  it("should toggle form visibility", () => {
    render(
      <AmendmentTimeline
        amendments={mockAmendments}
        currentVersion={1}
        isProposer={true}
        isPending={true}
        diff={null}
      />,
    );

    const button = screen.getByText("+ Create Amendment");
    fireEvent.click(button);

    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Updated proposal description")).toBeInTheDocument();
  });
});

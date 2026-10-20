/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AmendmentsPage } from "../AmendmentsPage";

jest.mock("@/hooks/useAmendments", () => ({
  useAmendments: jest.fn(),
}));

jest.mock("../AmendmentTimeline", () => ({
  AmendmentTimeline: ({ amendments, currentVersion, isProposer, isPending, onPublish, onSubmitAmendment, onFetchDiff }: any) => (
    <div data-testid="amendment-timeline">
      <div>Version: {currentVersion}</div>
      <div>Amendments: {amendments.length}</div>
      <div>Is Proposer: {isProposer ? "true" : "false"}</div>
      <div>Is Pending: {isPending ? "true" : "false"}</div>
      <button onClick={() => onPublish(1)}>Publish</button>
      <button onClick={() => onSubmitAmendment({})}>Submit</button>
      <button onClick={() => onFetchDiff(1, 2)}>Fetch Diff</button>
    </div>
  ),
}));

import { useAmendments } from "@/hooks/useAmendments";

const mockUseAmendments = useAmendments as jest.MockedFunction<typeof useAmendments>;

describe("AmendmentsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders loading state", () => {
    mockUseAmendments.mockReturnValue({
      amendments: [],
      currentVersion: 0,
      loading: true,
      error: null,
      diff: null,
      fetchAmendments: jest.fn(),
      fetchDiff: jest.fn(),
      submitAmendment: jest.fn(),
      publishAmendment: jest.fn(),
    } as any);

    render(<AmendmentsPage proposalId={1} />);
    expect(screen.getByText("Loading amendments...")).toBeInTheDocument();
  });

  it("renders error state", () => {
    const errorMessage = "Failed to load amendments";
    mockUseAmendments.mockReturnValue({
      amendments: [],
      currentVersion: 0,
      loading: false,
      error: new Error(errorMessage),
      diff: null,
      fetchAmendments: jest.fn(),
      fetchDiff: jest.fn(),
      submitAmendment: jest.fn(),
      publishAmendment: jest.fn(),
    } as any);

    render(<AmendmentsPage proposalId={1} />);
    expect(screen.getByText("Error loading amendments")).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it("renders amendment timeline with amendments loaded", () => {
    const mockAmendments = [
      { id: 1, version: 1, createdAt: new Date() },
      { id: 2, version: 2, createdAt: new Date() },
    ];

    mockUseAmendments.mockReturnValue({
      amendments: mockAmendments,
      currentVersion: 2,
      loading: false,
      error: null,
      diff: null,
      fetchAmendments: jest.fn(),
      fetchDiff: jest.fn(),
      submitAmendment: jest.fn(),
      publishAmendment: jest.fn(),
    } as any);

    render(<AmendmentsPage proposalId={1} isProposer={true} isPending={false} />);
    
    expect(screen.getByTestId("amendment-timeline")).toBeInTheDocument();
    expect(screen.getByText("Version: 2")).toBeInTheDocument();
    expect(screen.getByText("Amendments: 2")).toBeInTheDocument();
    expect(screen.getByText("Is Proposer: true")).toBeInTheDocument();
    expect(screen.getByText("Is Pending: false")).toBeInTheDocument();
  });

  it("passes default props correctly", () => {
    mockUseAmendments.mockReturnValue({
      amendments: [],
      currentVersion: 0,
      loading: false,
      error: null,
      diff: null,
      fetchAmendments: jest.fn(),
      fetchDiff: jest.fn(),
      submitAmendment: jest.fn(),
      publishAmendment: jest.fn(),
    } as any);

    render(<AmendmentsPage proposalId={42} />);
    expect(mockUseAmendments).toHaveBeenCalledWith(42);
    expect(screen.getByText("Is Proposer: false")).toBeInTheDocument();
    expect(screen.getByText("Is Pending: true")).toBeInTheDocument();
  });

  it("calls publishAmendment when publish button is clicked", () => {
    const publishAmendment = jest.fn();
    mockUseAmendments.mockReturnValue({
      amendments: [],
      currentVersion: 1,
      loading: false,
      error: null,
      diff: null,
      fetchAmendments: jest.fn(),
      fetchDiff: jest.fn(),
      submitAmendment: jest.fn(),
      publishAmendment,
    } as any);

    render(<AmendmentsPage proposalId={1} />);
    fireEvent.click(screen.getByText("Publish"));
    expect(publishAmendment).toHaveBeenCalledWith(1);
  });

  it("calls fetchDiff when diff comparison is requested", () => {
    const fetchDiff = jest.fn();
    mockUseAmendments.mockReturnValue({
      amendments: [],
      currentVersion: 2,
      loading: false,
      error: null,
      diff: null,
      fetchAmendments: jest.fn(),
      fetchDiff,
      submitAmendment: jest.fn(),
      publishAmendment: jest.fn(),
    } as any);

    render(<AmendmentsPage proposalId={1} />);
    fireEvent.click(screen.getByText("Fetch Diff"));
    expect(fetchDiff).toHaveBeenCalledWith(1, 2);
  });
});

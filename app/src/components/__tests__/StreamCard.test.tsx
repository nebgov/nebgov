/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { StreamCard } from "../StreamCard";
import type { TreasuryBudgetStream } from "../../lib/treasury-client";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("../StreamUtilizationBar", () => ({
  StreamUtilizationBar: ({
    utilizationBps,
    remaining,
    total,
  }: {
    utilizationBps: number;
    remaining: bigint;
    total: bigint;
  }) => (
    <div data-testid="utilization-bar">
      <span data-testid="utilization-bps">{utilizationBps}</span>
      <span data-testid="remaining">{remaining.toString()}</span>
      <span data-testid="total">{total.toString()}</span>
    </div>
  ),
}));

const baseStream: TreasuryBudgetStream = {
  id: 1n,
  name: "Core Dev Fund",
  owner: "GOWNER123456789",
  totalAllocated: 10000n,
  totalSpent: 2500n,
  spendCount: 3,
  isActive: true,
  isRevoked: false,
};

describe("StreamCard", () => {
  it("renders stream name", () => {
    render(<StreamCard stream={baseStream} />);
    expect(screen.getByText("Core Dev Fund")).toBeInTheDocument();
  });

  it("renders stream id", () => {
    render(<StreamCard stream={baseStream} />);
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("renders owner address", () => {
    render(<StreamCard stream={baseStream} />);
    expect(screen.getByText("GOWNER123456789")).toBeInTheDocument();
  });

  it("renders spend count", () => {
    render(<StreamCard stream={baseStream} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("links to the stream detail page", () => {
    render(<StreamCard stream={baseStream} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/treasury/streams/1");
  });

  it("shows Active badge for active non-revoked stream", () => {
    render(<StreamCard stream={baseStream} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows Inactive badge for non-active non-revoked stream", () => {
    render(<StreamCard stream={{ ...baseStream, isActive: false }} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows Revoked badge for revoked stream", () => {
    render(<StreamCard stream={{ ...baseStream, isRevoked: true }} />);
    expect(screen.getByText("Revoked")).toBeInTheDocument();
  });

  it("Revoked takes precedence over Active", () => {
    render(<StreamCard stream={{ ...baseStream, isActive: true, isRevoked: true }} />);
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("passes correct utilization to StreamUtilizationBar", () => {
    render(<StreamCard stream={baseStream} />);
    // 2500 / 10000 * 10000 = 2500 bps = 25%
    expect(screen.getByTestId("utilization-bps")).toHaveTextContent("2500");
  });

  it("passes correct remaining to StreamUtilizationBar", () => {
    render(<StreamCard stream={baseStream} />);
    expect(screen.getByTestId("remaining")).toHaveTextContent("7500");
  });

  it("passes correct total to StreamUtilizationBar", () => {
    render(<StreamCard stream={baseStream} />);
    expect(screen.getByTestId("total")).toHaveTextContent("10000");
  });

  it("handles zero allocation without divide-by-zero", () => {
    render(
      <StreamCard stream={{ ...baseStream, totalAllocated: 0n, totalSpent: 0n }} />
    );
    expect(screen.getByTestId("utilization-bps")).toHaveTextContent("0");
  });

  it("renders large stream id correctly", () => {
    render(<StreamCard stream={{ ...baseStream, id: 999999n }} />);
    expect(screen.getByText("#999999")).toBeInTheDocument();
  });
});

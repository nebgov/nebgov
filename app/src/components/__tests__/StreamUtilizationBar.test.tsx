import React from "react";
import { render, screen } from "@testing-library/react";
import { StreamUtilizationBar } from "../StreamUtilizationBar";

function renderBar(utilizationBps: number, remaining = 500n, total = 1000n) {
  const { container } = render(
    <StreamUtilizationBar utilizationBps={utilizationBps} remaining={remaining} total={total} />
  );
  const fill = container.querySelector(".h-full") as HTMLElement;
  return { container, fill };
}

describe("StreamUtilizationBar", () => {
  it("renders the utilization label and percentage with one decimal", () => {
    renderBar(4567);
    expect(screen.getByText("Utilization")).toBeInTheDocument();
    expect(screen.getByText("45.7%")).toBeInTheDocument();
  });

  it("renders remaining and total amounts from bigint props", () => {
    renderBar(5000, 123456789012345678901n, 999999999999999999999n);
    expect(screen.getByText("Remaining: 123456789012345678901")).toBeInTheDocument();
    expect(screen.getByText("Total: 999999999999999999999")).toBeInTheDocument();
  });

  it("renders zero utilization with an empty bar", () => {
    const { fill } = renderBar(0, 1000n, 1000n);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
    expect(fill.style.width).toBe("0%");
    expect(fill).toHaveClass("bg-emerald-500");
  });

  it("sets the bar width to the utilization percentage", () => {
    const { fill } = renderBar(2550);
    expect(fill.style.width).toBe("25.5%");
  });

  it("uses green below 70%", () => {
    const { fill } = renderBar(6999);
    expect(fill).toHaveClass("bg-emerald-500");
    expect(fill).not.toHaveClass("bg-amber-500");
  });

  it("uses amber from 70% up to below 90%", () => {
    expect(renderBar(7000).fill).toHaveClass("bg-amber-500");
    expect(renderBar(8999).fill).toHaveClass("bg-amber-500");
  });

  it("uses red at 90% and above", () => {
    const { fill } = renderBar(9000);
    expect(fill).toHaveClass("bg-red-500");
    expect(fill).not.toHaveClass("bg-amber-500");
  });

  it("caps the bar width at 100% when utilization exceeds 100%", () => {
    const { fill } = renderBar(12500, 0n, 1000n);
    expect(screen.getByText("125.0%")).toBeInTheDocument();
    expect(fill.style.width).toBe("100%");
    expect(fill).toHaveClass("bg-red-500");
  });
});

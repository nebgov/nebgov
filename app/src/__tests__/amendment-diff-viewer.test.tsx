import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { AmendmentDiffViewer } from "@/components/AmendmentDiffViewer";

describe("AmendmentDiffViewer", () => {
  it("should render no changes message when diff is null", () => {
    render(<AmendmentDiffViewer diff={null} />);
    expect(screen.getByText("No changes between versions")).toBeInTheDocument();
  });

  it("should render no changes message when diff is empty", () => {
    render(<AmendmentDiffViewer diff={[]} />);
    expect(screen.getByText("No changes between versions")).toBeInTheDocument();
  });

  it("should render loading state", () => {
    render(<AmendmentDiffViewer diff={null} loading={true} />);
    expect(screen.getByText("Loading diff...")).toBeInTheDocument();
  });

  it("should render diff patches", () => {
    const diff = [
      {
        op: "replace",
        path: "/description",
        value: "Updated description",
      },
      {
        op: "remove",
        path: "/target_address",
      },
    ];

    render(<AmendmentDiffViewer diff={diff} />);

    expect(screen.getByText("/description")).toBeInTheDocument();
    expect(screen.getByText("/target_address")).toBeInTheDocument();
    expect(screen.getByText("Updated description")).toBeInTheDocument();
  });

  it("should color code patch operations", () => {
    const diff = [
      {
        op: "replace",
        path: "/description",
        value: "Updated",
      },
      {
        op: "remove",
        path: "/target",
      },
      {
        op: "add",
        path: "/function",
        value: "new_function",
      },
    ];

    const { container } = render(<AmendmentDiffViewer diff={diff} />);

    const badges = container.querySelectorAll(".px-2.py-1.rounded.text-xs.font-medium");
    expect(badges.length).toBeGreaterThan(0);
  });
});

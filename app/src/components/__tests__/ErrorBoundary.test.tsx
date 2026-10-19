/**
 * @jest-environment jsdom
 */

import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";
import { reportFrontendError } from "../../lib/frontend-error";

jest.mock("../../lib/frontend-error", () => {
  const actual = jest.requireActual("../../lib/frontend-error");
  return {
    ...actual,
    reportFrontendError: jest.fn(),
  };
});

let shouldThrow = true;

function Child({ label = "child content" }: { label?: string }) {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return <p>{label}</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    jest.spyOn(console, "error").mockImplementation(() => {});
    (reportFrontendError as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders its children when nothing throws", () => {
    shouldThrow = false;

    render(
      <ErrorBoundary title="Stream list">
        <Child />
      </ErrorBoundary>,
    );

    expect(screen.getByText("child content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error state with the title when a child throws", () => {
    render(
      <ErrorBoundary title="Stream list">
        <Child />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stream list" })).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("uses fallbackMessage instead of the error message when provided", () => {
    render(
      <ErrorBoundary title="Stream list" fallbackMessage="Could not load streams.">
        <Child />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Could not load streams.")).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("reports the error with the boundary context and title", () => {
    render(
      <ErrorBoundary title="Stream list">
        <Child />
      </ErrorBoundary>,
    );

    expect(reportFrontendError).toHaveBeenCalledWith(
      "component_boundary",
      expect.any(Error),
      expect.objectContaining({ title: "Stream list" }),
    );
  });

  it("calls onReset and renders the children again after Try again", () => {
    const onReset = jest.fn();

    render(
      <ErrorBoundary title="Stream list" onReset={onReset}>
        <Child />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("child content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the error when resetKeys change", () => {
    function Harness() {
      const [key, setKey] = useState("first");
      return (
        <>
          <button type="button" onClick={() => setKey("second")}>
            change key
          </button>
          <ErrorBoundary title="Stream list" resetKeys={[key]}>
            <Child />
          </ErrorBoundary>
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "change key" }));

    expect(screen.getByText("child content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

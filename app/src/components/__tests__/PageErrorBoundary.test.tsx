import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PageErrorBoundary } from "../PageErrorBoundary";

describe("PageErrorBoundary", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders a page-specific fallback and retries the page content", () => {
    let shouldThrow = true;

    function FlakyPage() {
      if (shouldThrow) {
        throw new Error("Indexer connection failed");
      }

      return <div>Recovered page content</div>;
    }

    render(
      <PageErrorBoundary pageName="Analytics">
        <FlakyPage />
      </PageErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong while loading the Analytics page.",
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Recovered page content")).toBeInTheDocument();
  });
});

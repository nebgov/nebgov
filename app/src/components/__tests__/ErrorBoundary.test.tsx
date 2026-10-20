import React from "react";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";
import { ErrorState } from "../ErrorState";
import * as frontendError from "../../lib/frontend-error";

jest.mock("../ErrorState", () => ({
  ErrorState: jest.fn(({ title, message, onRetry }) => (
    <div data-testid="error-state">
      <div>{title}</div>
      <div>{message}</div>
      <button onClick={onRetry}>Retry</button>
    </div>
  )),
}));

jest.mock("../../lib/frontend-error", () => ({
  getErrorMessage: jest.fn((error) => `Error: ${error.message}`),
  reportFrontendError: jest.fn(),
}));

const mockErrorState = ErrorState as jest.Mock;
const mockGetErrorMessage = frontendError.getErrorMessage as jest.Mock;
const mockReportFrontendError = frontendError.reportFrontendError as jest.Mock;

// Suppress console.error for error boundary tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe("ErrorBoundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering children", () => {
    it("renders children when no error occurs", () => {
      render(
        <ErrorBoundary title="Test Boundary">
          <div>Child content</div>
        </ErrorBoundary>
      );
      expect(screen.getByText("Child content")).toBeInTheDocument();
    });

    it("renders multiple children", () => {
      render(
        <ErrorBoundary title="Test Boundary">
          <div>Child 1</div>
          <div>Child 2</div>
        </ErrorBoundary>
      );
      expect(screen.getByText("Child 1")).toBeInTheDocument();
      expect(screen.getByText("Child 2")).toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("catches errors thrown in children", () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <ErrorBoundary title="Test Boundary">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });

    it("displays error state with title", () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <ErrorBoundary title="My Boundary Title">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText("My Boundary Title")).toBeInTheDocument();
      expect(mockErrorState).toHaveBeenCalledWith(
        expect.objectContaining({ title: "My Boundary Title" }),
        expect.anything()
      );
    });

    it("displays error message from getErrorMessage", () => {
      mockGetErrorMessage.mockReturnValue("Custom error display");
      const ThrowError = () => {
        throw new Error("Original error");
      };

      render(
        <ErrorBoundary title="Test Boundary">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText("Custom error display")).toBeInTheDocument();
    });

    it("uses fallbackMessage when provided", () => {
      const ThrowError = () => {
        throw new Error("Original error");
      };

      render(
        <ErrorBoundary title="Test Boundary" fallbackMessage="Fallback message">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText("Fallback message")).toBeInTheDocument();
      expect(mockGetErrorMessage).not.toHaveBeenCalled();
    });

    it("applies custom className to ErrorState", () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <ErrorBoundary title="Test Boundary" className="custom-boundary-class">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(mockErrorState).toHaveBeenCalledWith(
        expect.objectContaining({ className: "custom-boundary-class" }),
        expect.anything()
      );
    });

    it("reports error with context", () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <ErrorBoundary title="Test Boundary">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(mockReportFrontendError).toHaveBeenCalledWith(
        "component_boundary",
        expect.any(Error),
        expect.objectContaining({
          title: "Test Boundary",
          componentStack: expect.any(String),
        })
      );
    });
  });

  describe("recovery with resetKeys", () => {
    it("resets error when resetKeys changes", () => {
      const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
        if (shouldThrow) {
          throw new Error("Test error");
        }
        return <div>Success</div>;
      };

      const { rerender } = render(
        <ErrorBoundary title="Test Boundary" resetKeys={[false]}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId("error-state")).toBeInTheDocument();

      rerender(
        <ErrorBoundary title="Test Boundary" resetKeys={[true]}>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
      expect(screen.getByText("Success")).toBeInTheDocument();
    });

    it("does not reset when resetKeys length changes but values are same", () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      const { rerender } = render(
        <ErrorBoundary title="Test Boundary" resetKeys={[1, 2]}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByTestId("error-state")).toBeInTheDocument();

      rerender(
        <ErrorBoundary title="Test Boundary" resetKeys={[1]}>
          <ThrowError />
        </ErrorBoundary>
      );

      // Error state should still be displayed because length changed
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });

    it("does not reset when resetKeys values don't change", () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      const { rerender } = render(
        <ErrorBoundary title="Test Boundary" resetKeys={[1, 2]}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByTestId("error-state")).toBeInTheDocument();

      rerender(
        <ErrorBoundary title="Test Boundary" resetKeys={[1, 2]}>
          <ThrowError />
        </ErrorBoundary>
      );

      // Error state should still be displayed
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });
  });

  describe("retry functionality", () => {
    it("calls onRetry callback when retry button clicked", () => {
      const onRetry = jest.fn();
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <ErrorBoundary title="Test Boundary" onReset={onRetry}>
          <ThrowError />
        </ErrorBoundary>
      );

      screen.getByText("Retry").click();
      expect(onRetry).toHaveBeenCalled();
    });

    it("clears error state when retry is clicked", () => {
      const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
        if (shouldThrow) {
          throw new Error("Test error");
        }
        return <div>Success</div>;
      };

      const { rerender } = render(
        <ErrorBoundary title="Test Boundary">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId("error-state")).toBeInTheDocument();

      screen.getByText("Retry").click();

      rerender(
        <ErrorBoundary title="Test Boundary">
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
      expect(screen.getByText("Success")).toBeInTheDocument();
    });
  });

  describe("multiple errors", () => {
    it("displays the first error that occurs", () => {
      const FirstError = () => {
        throw new Error("First error");
      };

      render(
        <ErrorBoundary title="Test Boundary">
          <FirstError />
        </ErrorBoundary>
      );

      expect(mockGetErrorMessage).toHaveBeenCalledWith(
        expect.objectContaining({ message: "First error" })
      );
    });
  });

  describe("edge cases", () => {
    it("handles missing onReset prop", () => {
      const ThrowError = () => {
        throw new Error("Test error");
      };

      render(
        <ErrorBoundary title="Test Boundary">
          <ThrowError />
        </ErrorBoundary>
      );

      // Should not throw when retry is clicked
      screen.getByText("Retry").click();
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });

    it("handles error without message", () => {
      mockGetErrorMessage.mockReturnValue("Unknown error");
      const ThrowError = () => {
        throw new Error();
      };

      render(
        <ErrorBoundary title="Test Boundary">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText("Unknown error")).toBeInTheDocument();
    });
  });
});

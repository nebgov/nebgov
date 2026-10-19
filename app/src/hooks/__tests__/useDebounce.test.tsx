/**
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "../useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("initial value", () => {
    it("returns initial value immediately on mount without delay", () => {
      const { result } = renderHook(() => useDebounce("initial", 500));
      expect(result.current).toBe("initial");
    });

    it("works with various data types immediately", () => {
      const { result: numResult } = renderHook(() => useDebounce(42, 500));
      expect(numResult.current).toBe(42);

      const { result: boolResult } = renderHook(() => useDebounce(false, 500));
      expect(boolResult.current).toBe(false);

      const obj = { key: "value" };
      const { result: objResult } = renderHook(() => useDebounce(obj, 500));
      expect(objResult.current).toBe(obj);

      const arr = [1, 2, 3];
      const { result: arrResult } = renderHook(() => useDebounce(arr, 500));
      expect(arrResult.current).toBe(arr);
    });

    it("maintains the value across rerenders when the value has not changed", () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: "steady", delay: 500 } }
      );

      expect(result.current).toBe("steady");

      rerender({ value: "steady", delay: 500 });
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe("steady");
    });
  });

  describe("debounced update after specified delay", () => {
    it("does not update the debounced value before the delay elapses", () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: "first", delay: 500 } }
      );

      expect(result.current).toBe("first");

      rerender({ value: "second", delay: 500 });
      expect(result.current).toBe("first");

      act(() => {
        jest.advanceTimersByTime(499);
      });
      expect(result.current).toBe("first");
    });

    it("updates the debounced value once the delay elapses", () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: "first", delay: 500 } }
      );

      rerender({ value: "second", delay: 500 });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe("second");
    });
  });

  describe("cancellation/reset on rapid updates before delay", () => {
    it("cancels previous timeout and resets delay when value updates rapidly", () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: "v1", delay: 500 } }
      );

      // Change to v2
      rerender({ value: "v2", delay: 500 });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe("v1");

      // Change to v3 before 500ms from v2
      rerender({ value: "v3", delay: 500 });

      // Advance 300ms (total 600ms since v2 change, but only 300ms since v3 change)
      act(() => {
        jest.advanceTimersByTime(300);
      });
      // Should still be v1 because v2 was cancelled and v3 hasn't reached 500ms
      expect(result.current).toBe("v1");

      // Advance remaining 200ms to complete 500ms for v3
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(result.current).toBe("v3");
    });

    it("only emits the latest value after a sequence of rapid changes", () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: "alpha", delay: 300 } }
      );

      rerender({ value: "beta", delay: 300 });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      rerender({ value: "gamma", delay: 300 });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      rerender({ value: "delta", delay: 300 });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current).toBe("alpha");

      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(result.current).toBe("delta");
    });
  });

  describe("custom delay parameter", () => {
    it("respects different custom delay values", () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: "start", delay: 1000 } }
      );

      rerender({ value: "next", delay: 1000 });

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current).toBe("start");

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current).toBe("next");
    });

    it("resets timeout when delay parameter itself changes", () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: "initial", delay: 500 } }
      );

      rerender({ value: "updated", delay: 200 });

      act(() => {
        jest.advanceTimersByTime(199);
      });
      expect(result.current).toBe("initial");

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current).toBe("updated");
    });

    it("handles zero delay", () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: "immediate", delay: 0 } }
      );

      rerender({ value: "changed", delay: 0 });

      act(() => {
        jest.advanceTimersByTime(0);
      });
      expect(result.current).toBe("changed");
    });
  });

  describe("cleanup on unmount", () => {
    it("clears pending timeout on unmount", () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      const { unmount } = renderHook(() => useDebounce("test", 500));

      expect(clearTimeoutSpy).not.toHaveBeenCalled();

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      clearTimeoutSpy.mockRestore();
    });

    it("clears pending timeout on unmount after value change", () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      const { rerender, unmount } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: "initial", delay: 500 } }
      );

      rerender({ value: "updated", delay: 500 });
      const callsBeforeUnmount = clearTimeoutSpy.mock.calls.length;

      unmount();

      expect(clearTimeoutSpy.mock.calls.length).toBe(callsBeforeUnmount + 1);
      clearTimeoutSpy.mockRestore();
    });

    it("does not update debounced value after unmount", () => {
      const { result, rerender, unmount } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: "test", delay: 500 } }
      );

      rerender({ value: "updated-after-unmount", delay: 500 });
      unmount();

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe("test");
    });
  });
});

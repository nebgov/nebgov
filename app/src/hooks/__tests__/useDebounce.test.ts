import { renderHook, act, waitFor } from "@testing-library/react";
import { useDebounce } from "../useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 500));
    expect(result.current).toBe("initial");
  });

  it("debounces string value", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "initial", delay: 500 } }
    );

    expect(result.current).toBe("initial");

    rerender({ value: "updated", delay: 500 });
    expect(result.current).toBe("initial");

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe("updated");
  });

  it("debounces number value", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 10, delay: 300 } }
    );

    expect(result.current).toBe(10);

    rerender({ value: 20, delay: 300 });
    expect(result.current).toBe(10);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe(20);
  });

  it("debounces object value", () => {
    const initialObj = { name: "John" };
    const updatedObj = { name: "Jane" };

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: initialObj, delay: 500 } }
    );

    expect(result.current).toBe(initialObj);

    rerender({ value: updatedObj, delay: 500 });
    expect(result.current).toBe(initialObj);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe(updatedObj);
  });

  it("debounces array value", () => {
    const initialArray = [1, 2, 3];
    const updatedArray = [4, 5, 6];

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: initialArray, delay: 200 } }
    );

    expect(result.current).toBe(initialArray);

    rerender({ value: updatedArray, delay: 200 });
    expect(result.current).toBe(initialArray);

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(result.current).toBe(updatedArray);
  });

  it("resets timer on value change", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "first", delay: 500 } }
    );

    expect(result.current).toBe("first");

    rerender({ value: "second", delay: 500 });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toBe("first");

    rerender({ value: "third", delay: 500 });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toBe("first");

    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toBe("third");
  });

  it("uses different delays", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "initial", delay: 100 } }
    );

    rerender({ value: "updated", delay: 100 });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe("updated");

    rerender({ value: "next", delay: 300 });
    expect(result.current).toBe("updated");

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe("updated");

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe("next");
  });

  it("handles rapid value changes", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "a", delay: 500 } }
    );

    rerender({ value: "b", delay: 500 });
    rerender({ value: "c", delay: 500 });
    rerender({ value: "d", delay: 500 });
    rerender({ value: "e", delay: 500 });

    expect(result.current).toBe("a");

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe("e");
  });

  it("clears timeout on unmount", () => {
    const { unmount } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "initial", delay: 500 } }
    );

    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("handles zero delay", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "initial", delay: 0 } }
    );

    rerender({ value: "updated", delay: 0 });

    act(() => {
      jest.runAllTimers();
    });

    expect(result.current).toBe("updated");
  });

  it("handles negative delay (treated as 0)", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "initial", delay: -100 } }
    );

    rerender({ value: "updated", delay: -100 });

    act(() => {
      jest.runAllTimers();
    });

    expect(result.current).toBe("updated");
  });

  it("handles boolean values", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: true, delay: 300 } }
    );

    expect(result.current).toBe(true);

    rerender({ value: false, delay: 300 });
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe(false);
  });

  it("handles null value", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: null as any, delay: 300 } }
    );

    expect(result.current).toBe(null);

    rerender({ value: "text", delay: 300 });
    expect(result.current).toBe(null);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe("text");
  });

  it("handles undefined value", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: undefined as any, delay: 300 } }
    );

    expect(result.current).toBe(undefined);

    rerender({ value: "text", delay: 300 });
    expect(result.current).toBe(undefined);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe("text");
  });

  it("handles large delay", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "initial", delay: 100000 } }
    );

    rerender({ value: "updated", delay: 100000 });
    expect(result.current).toBe("initial");

    act(() => {
      jest.advanceTimersByTime(50000);
    });
    expect(result.current).toBe("initial");

    act(() => {
      jest.advanceTimersByTime(50000);
    });
    expect(result.current).toBe("updated");
  });

  it("debounces search input scenario", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "", delay: 500 } }
    );

    const searchQueries = ["r", "re", "rea", "reac", "react"];

    searchQueries.forEach((query) => {
      rerender({ value: query, delay: 500 });
      expect(result.current).toBe("");

      act(() => {
        jest.advanceTimersByTime(100);
      });
    });

    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(result.current).toBe("react");
  });

  it("works with changing delay values", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "test", delay: 500 } }
    );

    rerender({ value: "updated", delay: 1000 });

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe("test");

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe("updated");
  });
});

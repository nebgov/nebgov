import { getErrorMessage, reportFrontendError } from "../frontend-error";

describe("getErrorMessage", () => {
  it("returns the message of an Error", () => {
    expect(getErrorMessage(new Error("rpc unavailable"))).toBe("rpc unavailable");
  });

  it("returns a non-blank string unchanged", () => {
    expect(getErrorMessage("insufficient balance")).toBe("insufficient balance");
  });

  it("falls back to a generic message for empty or unusable values", () => {
    const unusable: unknown[] = [new Error(""), "", "   ", null, undefined, 42, { message: "x" }];
    for (const value of unusable) {
      expect(getErrorMessage(value)).toBe("Something went wrong.");
    }
  });
});

describe("reportFrontendError", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("builds a payload from an Error, logs it, and returns it", () => {
    const error = new TypeError("bad input");

    const payload = reportFrontendError("vote", error, { proposalId: "7" });

    expect(payload).toMatchObject({
      context: "vote",
      message: "bad input",
      name: "TypeError",
      stack: error.stack,
      details: { proposalId: "7" },
    });
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(consoleError).toHaveBeenCalledWith("[frontend-error]", payload);
  });

  it("omits name, stack, and details for non-Error values", () => {
    const payload = reportFrontendError("load", "network down");

    expect(payload.message).toBe("network down");
    expect(payload.name).toBeUndefined();
    expect(payload.stack).toBeUndefined();
    expect(payload.details).toBeUndefined();
  });
});

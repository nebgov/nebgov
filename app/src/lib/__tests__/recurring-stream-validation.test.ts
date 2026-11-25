import { validateRecurringSchedule } from "../recurring-stream-validation";

describe("recurring stream schedule", () => {
  it("rejects a schedule shorter than one interval", () => {
    expect(validateRecurringSchedule("100", "150", "100")).toMatch(/at least one interval/);
  });

  it("accepts exactly one interval", () => {
    expect(validateRecurringSchedule("100", "200", "100")).toBeNull();
  });

  it("rejects invalid and out-of-range ledgers", () => {
    expect(validateRecurringSchedule("1.5", "100", "10")).not.toBeNull();
    expect(validateRecurringSchedule("1", "4294967296", "10")).not.toBeNull();
    expect(validateRecurringSchedule("1", "100", "0")).not.toBeNull();
  });
});

import {
  evaluateConcentrationChecks,
  computeAlertTransitions,
  type ConcentrationCheckResult,
} from "../jobs/concentration-alert";

const defaultThresholds = {
  minNakamotoCoefficient: 5,
  maxTop5ShareBps: 6000,
  maxGiniCoefficientBps: 8000,
};

describe("evaluateConcentrationChecks", () => {
  it("all healthy when values are within thresholds", () => {
    const checks = evaluateConcentrationChecks(
      { nakamotoCoefficient: 10, top5ShareBps: 3000, giniCoefficientBps: 5000 },
      defaultThresholds,
    );
    expect(checks.every((c) => !c.alerting)).toBe(true);
  });

  it("nakamoto alert when coefficient drops below threshold", () => {
    const checks = evaluateConcentrationChecks(
      { nakamotoCoefficient: 3, top5ShareBps: 3000, giniCoefficientBps: 5000 },
      defaultThresholds,
    );
    expect(checks.find((c) => c.key === "nakamoto")?.alerting).toBe(true);
    expect(checks.find((c) => c.key === "top5_share")?.alerting).toBe(false);
    expect(checks.find((c) => c.key === "gini")?.alerting).toBe(false);
  });

  it("top5_share alert when share exceeds threshold", () => {
    const checks = evaluateConcentrationChecks(
      { nakamotoCoefficient: 10, top5ShareBps: 7000, giniCoefficientBps: 5000 },
      defaultThresholds,
    );
    expect(checks.find((c) => c.key === "top5_share")?.alerting).toBe(true);
  });

  it("gini alert when coefficient exceeds threshold", () => {
    const checks = evaluateConcentrationChecks(
      { nakamotoCoefficient: 10, top5ShareBps: 3000, giniCoefficientBps: 9000 },
      defaultThresholds,
    );
    expect(checks.find((c) => c.key === "gini")?.alerting).toBe(true);
  });

  it("multiple alerts can fire simultaneously", () => {
    const checks = evaluateConcentrationChecks(
      { nakamotoCoefficient: 2, top5ShareBps: 8000, giniCoefficientBps: 9000 },
      defaultThresholds,
    );
    expect(checks.filter((c) => c.alerting).length).toBe(3);
  });
});

describe("computeAlertTransitions", () => {
  function makeChecks(alertingKeys: string[]): ConcentrationCheckResult[] {
    const allKeys = ["nakamoto", "top5_share", "gini"];
    return allKeys.map((key) => ({
      key,
      alerting: alertingKeys.includes(key),
      detail: `test: ${key}`,
    }));
  }

  it("emits transition when healthy→alerting", () => {
    const previous = new Map<string, boolean>([
      ["nakamoto", false],
      ["top5_share", false],
      ["gini", false],
    ]);
    const checks = makeChecks(["nakamoto"]);
    const { transitions, nextState } = computeAlertTransitions(previous, checks);
    expect(transitions.length).toBe(1);
    expect(transitions[0].key).toBe("nakamoto");
    expect(nextState.get("nakamoto")).toBe(true);
  });

  it("does NOT re-emit while already alerting", () => {
    const previous = new Map<string, boolean>([
      ["nakamoto", true],
      ["top5_share", false],
      ["gini", false],
    ]);
    const checks = makeChecks(["nakamoto"]);
    const { transitions } = computeAlertTransitions(previous, checks);
    expect(transitions.length).toBe(0);
  });

  it("clears alert state when returning to healthy", () => {
    const previous = new Map<string, boolean>([
      ["nakamoto", true],
      ["top5_share", false],
      ["gini", false],
    ]);
    const checks = makeChecks([]);
    const { transitions, nextState } = computeAlertTransitions(previous, checks);
    expect(transitions.length).toBe(0);
    expect(nextState.get("nakamoto")).toBe(false);
  });

  it("re-emits after healthy→alerting→healthy→alerting cycle", () => {
    // Cycle: healthy → alert → healthy → alert
    const previous = new Map<string, boolean>([
      ["nakamoto", false], // was healthy, now alerting again
      ["top5_share", false],
      ["gini", false],
    ]);
    const checks = makeChecks(["nakamoto"]);
    const { transitions } = computeAlertTransitions(previous, checks);
    expect(transitions.length).toBe(1);
    expect(transitions[0].key).toBe("nakamoto");
  });

  it("handles multiple simultaneous transitions", () => {
    const previous = new Map<string, boolean>([
      ["nakamoto", false],
      ["top5_share", false],
      ["gini", true], // already alerting
    ]);
    const checks = makeChecks(["nakamoto", "top5_share", "gini"]);
    const { transitions } = computeAlertTransitions(previous, checks);
    expect(transitions.length).toBe(2);
    expect(transitions.map((t) => t.key).sort()).toEqual(["nakamoto", "top5_share"]);
  });
});
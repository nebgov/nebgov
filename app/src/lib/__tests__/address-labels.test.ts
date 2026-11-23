import {
  exportCustomLabels,
  getAddressLabel,
  getAllLabels,
  getCustomLabels,
  importCustomLabels,
  removeCustomLabel,
  setCustomLabel,
} from "../address-labels";

const LS_KEY = "nebgov_address_labels";
const ACCOUNT_A = "GDOOXICJPSOZDQRCEHZPR6MAX5PUZXVWGJ3QPVEU4DADIZQ4YBQOJNIB";
const ACCOUNT_B = "GD6HLZWRE5FHK3SDLZB3FH56R3H3ECAAYCPWWU7O7EK4FCNT2Z7S6D5I";
const CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

const savedEnvLabels = process.env.NEXT_PUBLIC_ADDRESS_LABELS;

function storedLabels(): Array<{ address: string; label: string; createdAt: number }> {
  return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
}

describe("address-labels", () => {
  beforeEach(() => {
    localStorage.clear();
    delete process.env.NEXT_PUBLIC_ADDRESS_LABELS;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (savedEnvLabels === undefined) {
      delete process.env.NEXT_PUBLIC_ADDRESS_LABELS;
    } else {
      process.env.NEXT_PUBLIC_ADDRESS_LABELS = savedEnvLabels;
    }
  });

  describe("environment labels", () => {
    it("parses address=label pairs and skips malformed ones", () => {
      process.env.NEXT_PUBLIC_ADDRESS_LABELS = [
        `${ACCOUNT_A}=Treasury`,
        ` ${ACCOUNT_B} = Team Wallet `,
        "no-equals-sign",
        "=missing-address",
        `${CONTRACT}=`,
      ].join(",");

      expect(getAllLabels().envLabels).toEqual({
        [ACCOUNT_A]: "Treasury",
        [ACCOUNT_B]: "Team Wallet",
      });
    });

    it("returns no env labels when the variable is unset", () => {
      expect(getAllLabels().envLabels).toEqual({});
    });
  });

  describe("custom labels", () => {
    it("returns a label after it has been set", () => {
      setCustomLabel(ACCOUNT_A, "Ops");

      expect(getAddressLabel(ACCOUNT_A)).toBe("Ops");
      expect(getCustomLabels()).toEqual({ [ACCOUNT_A]: "Ops" });
      expect(storedLabels()).toEqual([
        expect.objectContaining({ address: ACCOUNT_A, label: "Ops" }),
      ]);
    });

    it("prefers a custom label over an env label for the same address", () => {
      process.env.NEXT_PUBLIC_ADDRESS_LABELS = `${ACCOUNT_A}=From Env`;
      expect(getAddressLabel(ACCOUNT_A)).toBe("From Env");

      setCustomLabel(ACCOUNT_A, "Mine");
      expect(getAddressLabel(ACCOUNT_A)).toBe("Mine");
    });

    it("returns null for an address with no label", () => {
      expect(getAddressLabel(ACCOUNT_B)).toBeNull();
    });

    it("overwrites an existing label but keeps its original createdAt", () => {
      const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
      setCustomLabel(ACCOUNT_A, "First");

      now.mockReturnValue(9_999);
      setCustomLabel(ACCOUNT_A, "Second");

      expect(storedLabels()).toHaveLength(1);
      expect(storedLabels()[0]).toMatchObject({ label: "Second", createdAt: 1_000 });
    });

    it("removes only the requested label", () => {
      setCustomLabel(ACCOUNT_A, "A");
      setCustomLabel(ACCOUNT_B, "B");

      removeCustomLabel(ACCOUNT_A);

      expect(getCustomLabels()).toEqual({ [ACCOUNT_B]: "B" });
    });

    it("treats corrupted storage as having no custom labels", () => {
      localStorage.setItem(LS_KEY, "{not json");

      expect(getCustomLabels()).toEqual({});
      expect(getAddressLabel(ACCOUNT_A)).toBeNull();
    });
  });

  describe("export", () => {
    it("exports only custom labels as pretty-printed JSON", () => {
      process.env.NEXT_PUBLIC_ADDRESS_LABELS = `${ACCOUNT_B}=From Env`;
      setCustomLabel(ACCOUNT_A, "Mine");

      const exported = exportCustomLabels();

      expect(JSON.parse(exported)).toEqual({ [ACCOUNT_A]: "Mine" });
      expect(exported).toContain("\n");
    });
  });

  describe("import", () => {
    it("merges valid labels into existing ones", () => {
      setCustomLabel(ACCOUNT_A, "Existing");

      const ok = importCustomLabels(
        JSON.stringify({ [ACCOUNT_B]: "Imported", [CONTRACT]: "Contract" }),
      );

      expect(ok).toBe(true);
      expect(getCustomLabels()).toEqual({
        [ACCOUNT_A]: "Existing",
        [ACCOUNT_B]: "Imported",
        [CONTRACT]: "Contract",
      });
    });

    it("round-trips an export", () => {
      setCustomLabel(ACCOUNT_A, "Round trip");
      const exported = exportCustomLabels();

      localStorage.clear();
      expect(importCustomLabels(exported)).toBe(true);
      expect(getAddressLabel(ACCOUNT_A)).toBe("Round trip");
    });

    it("skips entries whose label is not a string", () => {
      const ok = importCustomLabels(
        JSON.stringify({ [ACCOUNT_A]: 5, [ACCOUNT_B]: "Kept" }),
      );

      expect(ok).toBe(true);
      expect(getCustomLabels()).toEqual({ [ACCOUNT_B]: "Kept" });
    });

    it("skips keys that are not valid Stellar account or contract addresses", () => {
      const ok = importCustomLabels(
        JSON.stringify({
          "not-an-address": "Bogus",
          [`${ACCOUNT_A.slice(0, -1)}X`]: "Bad checksum",
          [ACCOUNT_B]: "Valid",
        }),
      );

      expect(ok).toBe(true);
      expect(getCustomLabels()).toEqual({ [ACCOUNT_B]: "Valid" });
    });

    it("rejects malformed JSON and leaves stored labels untouched", () => {
      setCustomLabel(ACCOUNT_A, "Keep me");
      const before = localStorage.getItem(LS_KEY);

      expect(importCustomLabels("{not json")).toBe(false);
      expect(localStorage.getItem(LS_KEY)).toBe(before);
    });

    it.each([
      ["null", "null"],
      ["an array", JSON.stringify([ACCOUNT_A])],
      ["a bare string", JSON.stringify("hello")],
      ["a number", "42"],
    ])("rejects a top-level value that is %s", (_name, payload) => {
      expect(importCustomLabels(payload)).toBe(false);
      expect(getCustomLabels()).toEqual({});
    });
  });
});

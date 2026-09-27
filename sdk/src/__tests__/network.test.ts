import { validateNetwork, getRpcUrl, getNetworkPassphrase, RPC_URLS, NETWORK_PASSPHRASES } from "../network";

describe("network utilities", () => {
  describe("validateNetwork", () => {
    it("should accept valid network names", () => {
      expect(validateNetwork("mainnet")).toBe("mainnet");
      expect(validateNetwork("testnet")).toBe("testnet");
      expect(validateNetwork("futurenet")).toBe("futurenet");
    });

    it("should throw error for invalid network names", () => {
      expect(() => validateNetwork("unknown")).toThrow(
        "Unknown network: unknown. Supported networks: mainnet, testnet, futurenet"
      );
      expect(() => validateNetwork("mainnet2")).toThrow();
      expect(() => validateNetwork("")).toThrow();
      expect(() => validateNetwork("testnet ")).toThrow();
    });
  });

  describe("getRpcUrl", () => {
    it("should return default RPC URL when no override provided", () => {
      expect(getRpcUrl("mainnet")).toBe(RPC_URLS.mainnet);
      expect(getRpcUrl("testnet")).toBe(RPC_URLS.testnet);
      expect(getRpcUrl("futurenet")).toBe(RPC_URLS.futurenet);
    });

    it("should return override URL when provided", () => {
      const customUrl = "https://custom.rpc.url";
      expect(getRpcUrl("mainnet", customUrl)).toBe(customUrl);
      expect(getRpcUrl("testnet", customUrl)).toBe(customUrl);
    });

    it("should validate network before returning URL", () => {
      expect(() => getRpcUrl("invalid")).toThrow();
    });
  });

  describe("getNetworkPassphrase", () => {
    it("should return correct passphrase for valid networks", () => {
      expect(getNetworkPassphrase("mainnet")).toBe(NETWORK_PASSPHRASES.mainnet);
      expect(getNetworkPassphrase("testnet")).toBe(NETWORK_PASSPHRASES.testnet);
      expect(getNetworkPassphrase("futurenet")).toBe(NETWORK_PASSPHRASES.futurenet);
    });

    it("should validate network before returning passphrase", () => {
      expect(() => getNetworkPassphrase("invalid")).toThrow();
    });
  });
});

import { loadConfig, loadKeypair, required } from "../config";
import { FACTORY, GOVERNOR, SIGNER, useCleanEnvironment, writeTemp } from "./helpers";

useCleanEnvironment();

describe("loadConfig", () => {
  it("defaults to testnet when the config file is unusable and no env is set", async () => {
    await expect(loadConfig(writeTemp("absent-dir-config.json", "not json"))).resolves.toEqual({ network: "testnet" });
  });

  it("lets NEBGOV_* env vars override the config file", async () => {
    const file = writeTemp("cfg.json", JSON.stringify({ network: "futurenet", governorAddress: "from-file" }));
    process.env.NEBGOV_GOVERNOR_ADDRESS = GOVERNOR;
    process.env.NEBGOV_FACTORY_ADDRESS = FACTORY;

    const cfg = await loadConfig(file);
    expect(cfg).toMatchObject({ network: "futurenet", governorAddress: GOVERNOR, factoryAddress: FACTORY });
  });

  it("reads the config path from NEBGOV_CONFIG", async () => {
    process.env.NEBGOV_CONFIG = writeTemp("env-cfg.json", JSON.stringify({ network: "mainnet" }));
    await expect(loadConfig()).resolves.toMatchObject({ network: "mainnet" });
  });

  it("rejects an unknown network", async () => {
    process.env.NEBGOV_NETWORK = "devnet";
    await expect(loadConfig(writeTemp("empty.json", "{}"))).rejects.toThrow(
      'network must be one of: mainnet, testnet, futurenet (got "devnet")',
    );
  });
});

describe("required", () => {
  it("names both the env var and the config key when a field is missing", () => {
    expect(() => required({ network: "testnet" }, "factoryAddress")).toThrow(
      'Missing required config: factoryAddress (set NEBGOV_FACTORY_ADDRESS or add "factoryAddress" to the config file)',
    );
    expect(required({ network: "testnet", factoryAddress: FACTORY }, "factoryAddress")).toBe(FACTORY);
  });
});

describe("loadKeypair", () => {
  it.each([
    ["raw secret", SIGNER.secret() + "\n"],
    ["JSON secret", JSON.stringify({ secret: SIGNER.secret() })],
    ["JSON secretKey", JSON.stringify({ secretKey: SIGNER.secret() })],
    ["JSON privateKey", JSON.stringify({ privateKey: SIGNER.secret() })],
    ["JSON string", JSON.stringify(SIGNER.secret())],
  ])("loads a %s", async (_label, content) => {
    const keypair = await loadKeypair(writeTemp(`kp-${_label.replace(/\s/g, "-")}`, content));
    expect(keypair.publicKey()).toBe(SIGNER.publicKey());
  });

  it("fails with a clear message, without echoing file contents", async () => {
    const file = writeTemp("kp-bad.json", JSON.stringify({ secret: "SNOTAREALSECRET" }));
    await expect(loadKeypair(file)).rejects.toThrow(`No valid Stellar secret key found in keypair file ${file}`);
    await expect(loadKeypair(file)).rejects.not.toThrow(/SNOTAREALSECRET/);
  });
});

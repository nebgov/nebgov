jest.mock("@nebgov/sdk", () => jest.requireActual("./sdkMock").mockSdk());

import { FactoryClient, VoteType } from "@nebgov/sdk";
import { stubClient } from "./sdkMock";
import {
  ACCOUNT,
  BASE_CONFIG,
  FACTORY,
  SIGNER,
  TOKEN,
  contractAddress,
  runCli,
  useCleanEnvironment,
  writeKeypairFile,
} from "./helpers";

useCleanEnvironment();

const entry = {
  id: 3n,
  governor: contractAddress(30),
  timelock: contractAddress(31),
  token: contractAddress(32),
  deployer: SIGNER.publicKey(),
};

const defaultSettings = {
  votingDelay: 60,
  votingPeriod: 17280,
  quorumNumerator: 4,
  proposalThreshold: 100_000_000n,
  timelockDelay: 3600n,
  voteType: VoteType.Extended,
  proposalGracePeriod: 120_960,
};

describe("factory deploy", () => {
  const stubFactory = () =>
    stubClient(FactoryClient, {
      deploy: jest.fn().mockResolvedValue(3n),
      getGovernor: jest.fn().mockResolvedValue(entry),
    });

  it("deploys with default settings, guarded by the deployer, and prints .env lines", async () => {
    const factory = stubFactory();

    const result = await runCli(["factory", "deploy", "--token", TOKEN, "--keypair", writeKeypairFile()]);

    expect(FactoryClient).toHaveBeenCalledWith({ network: "testnet", factoryAddress: FACTORY, rpcUrl: undefined });
    expect(factory.deploy).toHaveBeenCalledWith(expect.anything(), TOKEN, {
      ...defaultSettings,
      guardian: SIGNER.publicKey(),
    });
    expect(factory.deploy.mock.calls[0][0].publicKey()).toBe(SIGNER.publicKey());
    expect(factory.getGovernor).toHaveBeenCalledWith(3n);
    expect(result.stdout).toBe(
      [
        `# NebGov governor #3 deployed via factory ${FACTORY}`,
        "NEBGOV_NETWORK=testnet",
        `NEBGOV_GOVERNOR_ADDRESS=${entry.governor}`,
        `NEBGOV_TIMELOCK_ADDRESS=${entry.timelock}`,
        `NEBGOV_VOTES_ADDRESS=${entry.token}`,
      ].join("\n"),
    );
  });

  it("maps every DeploySettings flag", async () => {
    const factory = stubFactory();

    await runCli(
      [
        "factory",
        "deploy",
        "--token",
        TOKEN,
        "--guardian",
        ACCOUNT,
        "--voting-delay",
        "10",
        "--voting-period",
        "500",
        "--quorum-numerator",
        "0",
        "--proposal-threshold",
        "123456789012345678901234567890",
        "--timelock-delay",
        "86400",
        "--vote-type",
        "quadratic",
        "--proposal-grace-period",
        "1000",
      ],
      { ...BASE_CONFIG, keypairFile: writeKeypairFile() },
    );

    expect(factory.deploy).toHaveBeenCalledWith(expect.anything(), TOKEN, {
      votingDelay: 10,
      votingPeriod: 500,
      quorumNumerator: 0,
      proposalThreshold: 123456789012345678901234567890n,
      timelockDelay: 86400n,
      guardian: ACCOUNT,
      voteType: VoteType.Quadratic,
      proposalGracePeriod: 1000,
    });
  });

  it("--format json prints the governor entry", async () => {
    stubFactory();
    const result = await runCli(["factory", "deploy", "--token", TOKEN, "--keypair", writeKeypairFile(), "--format", "json"]);
    expect(result.json()).toEqual({ ...entry, id: "3" });
  });

  it("--dry-run validates and prints the settings without a keypair or network", async () => {
    const result = await runCli(["--dry-run", "factory", "deploy", "--token", TOKEN, "--guardian", ACCOUNT]);

    expect(FactoryClient).not.toHaveBeenCalled();
    expect(result.json()).toEqual({
      action: "factory.deploy",
      factory: FACTORY,
      deployer: null,
      token: TOKEN,
      ...defaultSettings,
      proposalThreshold: "100000000",
      timelockDelay: "3600",
      guardian: ACCOUNT,
    });
  });

  it("still reports the new id when reading back the addresses fails", async () => {
    stubClient(FactoryClient, {
      deploy: jest.fn().mockResolvedValue(8n),
      getGovernor: jest.fn().mockRejectedValue(new Error("rpc timeout")),
    });
    await expect(
      runCli(["factory", "deploy", "--token", TOKEN, "--keypair", writeKeypairFile()]),
    ).rejects.toThrow(
      "Governor #8 was deployed but its addresses could not be read (rpc timeout). " +
        "Retrieve them with: nebgov factory show 8 --format env",
    );
  });

  it.each([
    [["--voting-period", "0"], "voting-period must be greater than 0"],
    [["--quorum-numerator", "101"], "quorum-numerator must be between 0 and 100"],
    [["--timelock-delay", "0"], "timelock-delay must be greater than 0"],
    [["--voting-delay", "4294967296"], /voting-delay must be at most 4294967295/],
    [["--proposal-threshold", "-5"], /unknown option|proposal-threshold must be a non-negative integer/],
    [["--vote-type", "ranked"], /vote-type must be one of/],
    [["--guardian", "GBAD"], /guardian must be a Stellar/],
    [["--format", "yaml"], /format must be one of: env, json/],
  ])("rejects %p before deploying", async (override, message) => {
    const factory = stubFactory();
    await expect(
      runCli(["factory", "deploy", "--token", TOKEN, "--keypair", writeKeypairFile(), ...override]),
    ).rejects.toThrow(message);
    expect(factory.deploy).not.toHaveBeenCalled();
  });

  it("requires a contract --token, a keypair, a guardian source and a factory address", async () => {
    const factory = stubFactory();
    await expect(runCli(["factory", "deploy", "--keypair", "k"])).rejects.toThrow(
      /required option '--token <address>'/,
    );
    await expect(runCli(["factory", "deploy", "--token", ACCOUNT, "--keypair", "k"])).rejects.toThrow(
      /token must be a Stellar contract/,
    );
    await expect(runCli(["factory", "deploy", "--token", TOKEN, "--guardian", ACCOUNT])).rejects.toThrow(
      "Missing --keypair or NEBGOV_KEYPAIR_FILE",
    );
    await expect(runCli(["--dry-run", "factory", "deploy", "--token", TOKEN])).rejects.toThrow(
      "Provide --guardian, or --keypair to default the guardian to the deployer",
    );
    await expect(
      runCli(["factory", "deploy", "--token", TOKEN, "--keypair", "k"], { network: "testnet" }),
    ).rejects.toThrow(/Missing required config: factoryAddress \(set NEBGOV_FACTORY_ADDRESS/);
    await expect(
      runCli(["factory", "deploy", "--token", TOKEN, "--keypair", "k"], { ...BASE_CONFIG, factoryAddress: ACCOUNT }),
    ).rejects.toThrow(/factoryAddress must be a Stellar contract/);
    expect(factory.deploy).not.toHaveBeenCalled();
  });
});

describe("factory list", () => {
  it("pages through deployed governors", async () => {
    const factory = stubClient(FactoryClient, { getAllGovernors: jest.fn().mockResolvedValue([entry]) });

    const result = await runCli(["factory", "list", "--limit", "10", "--offset", "5"]);

    expect(factory.getAllGovernors).toHaveBeenCalledWith({ limit: 10, offset: 5 });
    expect(result.json()).toEqual([{ ...entry, id: "3" }]);
  });

  it("defaults to the first 20 and validates paging", async () => {
    const factory = stubClient(FactoryClient, { getAllGovernors: jest.fn().mockResolvedValue([]) });
    await runCli(["factory", "list"]);
    expect(factory.getAllGovernors).toHaveBeenCalledWith({ limit: 20, offset: 0 });

    await expect(runCli(["factory", "list", "--limit", "0"])).rejects.toThrow(/limit must be at least 1/);
    await expect(runCli(["factory", "list", "--offset", "x"])).rejects.toThrow(/offset must be a non-negative integer/);
  });
});

describe("factory show", () => {
  it("prints the entry as JSON by default", async () => {
    const factory = stubClient(FactoryClient, { getGovernor: jest.fn().mockResolvedValue(entry) });

    const result = await runCli(["factory", "show", "3"]);

    expect(factory.getGovernor).toHaveBeenCalledWith(3n);
    expect(result.json()).toEqual({ ...entry, id: "3" });
  });

  it("--format env prints pasteable .env lines", async () => {
    stubClient(FactoryClient, { getGovernor: jest.fn().mockResolvedValue(entry) });
    const result = await runCli(["factory", "show", "3", "--format", "env"], { ...BASE_CONFIG, network: "mainnet" });
    expect(result.stdout.split("\n")).toEqual([
      "# NebGov governor #3",
      "NEBGOV_NETWORK=mainnet",
      `NEBGOV_GOVERNOR_ADDRESS=${entry.governor}`,
      `NEBGOV_TIMELOCK_ADDRESS=${entry.timelock}`,
      `NEBGOV_VOTES_ADDRESS=${entry.token}`,
    ]);
  });

  it("rejects a malformed id", async () => {
    await expect(runCli(["factory", "show", "three"])).rejects.toThrow(/id must be a non-negative integer/);
  });
});

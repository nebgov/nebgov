jest.mock("@nebgov/sdk", () => jest.requireActual("./sdkMock").mockSdk());

import { TreasuryClient } from "@nebgov/sdk";
import { stubClient } from "./sdkMock";
import {
  ACCOUNT,
  BASE_CONFIG,
  OTHER_ACCOUNT,
  SIGNER,
  TOKEN,
  TREASURY,
  runCli,
  useCleanEnvironment,
  writeKeypairFile,
  writeTemp,
} from "./helpers";

useCleanEnvironment();

describe("treasury balance", () => {
  const stubTreasury = () =>
    stubClient(TreasuryClient, {
      getOwners: jest.fn().mockResolvedValue([ACCOUNT]),
      getThreshold: jest.fn().mockResolvedValue(1),
      getTxCount: jest.fn().mockResolvedValue(4n),
      getSpentThisPeriod: jest.fn().mockResolvedValue(250n),
    });

  it("simulates as --viewer and reports token spend when --token is given", async () => {
    const treasury = stubTreasury();

    const result = await runCli(["treasury", "balance", "--viewer", ACCOUNT, "--token", TOKEN]);

    expect(TreasuryClient).toHaveBeenCalledWith(
      expect.objectContaining({ treasuryAddress: TREASURY, simulationAccount: ACCOUNT, network: "testnet" }),
    );
    expect(treasury.getSpentThisPeriod).toHaveBeenCalledWith(TOKEN);
    expect(result.json()).toEqual({
      viewer: ACCOUNT,
      owners: [ACCOUNT],
      threshold: 1,
      txCount: "4",
      spentThisPeriod: "250",
      token: TOKEN,
    });
  });

  it("skips token spend without --token and defaults the viewer", async () => {
    const treasury = stubTreasury();
    const result = await runCli(["treasury", "balance"], { ...BASE_CONFIG, defaultAccount: OTHER_ACCOUNT });
    expect(treasury.getSpentThisPeriod).not.toHaveBeenCalled();
    expect(result.json()).toMatchObject({ viewer: OTHER_ACCOUNT, spentThisPeriod: null, token: null });
  });

  it("validates --viewer and --token, and requires a viewer and treasury address", async () => {
    stubTreasury();
    await expect(runCli(["treasury", "balance", "--viewer", "G123"])).rejects.toThrow(/viewer must be a Stellar/);
    await expect(runCli(["treasury", "balance", "--viewer", ACCOUNT, "--token", ACCOUNT])).rejects.toThrow(
      /token must be a Stellar contract/,
    );
    await expect(runCli(["treasury", "balance"])).rejects.toThrow(/Provide --viewer/);
    await expect(
      runCli(["treasury", "balance", "--viewer", ACCOUNT], { network: "testnet" }),
    ).rejects.toThrow(/Missing required config: treasuryAddress/);
  });
});

describe("treasury batch-transfer", () => {
  const csv = () => writeTemp("payouts.csv", `address,amount\n${ACCOUNT},100\n${OTHER_ACCOUNT},250\n`);

  it("submits the parsed recipients from the signer", async () => {
    const treasury = stubClient(TreasuryClient, { batchTransfer: jest.fn().mockResolvedValue("op-hash") });

    const result = await runCli([
      "treasury",
      "batch-transfer",
      "--token",
      TOKEN,
      "--recipients",
      csv(),
      "--keypair",
      writeKeypairFile(),
    ]);

    expect(treasury.batchTransfer).toHaveBeenCalledWith(expect.anything(), TOKEN, [
      { address: ACCOUNT, amount: 100n },
      { address: OTHER_ACCOUNT, amount: 250n },
    ]);
    expect(treasury.batchTransfer.mock.calls[0][0].publicKey()).toBe(SIGNER.publicKey());
    expect(result.json()).toEqual({ opHash: "op-hash", recipients: 2 });
  });

  it("--dry-run prints the transfer plan without submitting", async () => {
    const treasury = stubClient(TreasuryClient, { batchTransfer: jest.fn() });

    const result = await runCli([
      "--dry-run",
      "treasury",
      "batch-transfer",
      "--token",
      TOKEN,
      "--recipients",
      csv(),
      "--keypair",
      "unused",
    ]);

    expect(treasury.batchTransfer).not.toHaveBeenCalled();
    expect(result.json()).toEqual({
      action: "treasury.batch-transfer",
      token: TOKEN,
      recipients: [
        { address: ACCOUNT, amount: "100" },
        { address: OTHER_ACCOUNT, amount: "250" },
      ],
      count: 2,
    });
  });

  it("refuses an empty or malformed recipients file", async () => {
    const treasury = stubClient(TreasuryClient, { batchTransfer: jest.fn() });
    const base = ["treasury", "batch-transfer", "--token", TOKEN, "--keypair", writeKeypairFile(), "--recipients"];

    await expect(runCli([...base, writeTemp("empty.csv", "address,amount\n")])).rejects.toThrow(
      "No recipients parsed from CSV",
    );
    await expect(runCli([...base, writeTemp("typo.csv", `${ACCOUNT},100\n${OTHER_ACCOUNT};5\n`)])).rejects.toThrow(
      /recipients line 2/,
    );
    expect(treasury.batchTransfer).not.toHaveBeenCalled();
  });

  it("requires --token to be a contract and all options to be present", async () => {
    stubClient(TreasuryClient, { batchTransfer: jest.fn() });
    await expect(
      runCli(["treasury", "batch-transfer", "--token", ACCOUNT, "--recipients", csv(), "--keypair", "k"]),
    ).rejects.toThrow(/token must be a Stellar contract/);
    await expect(runCli(["treasury", "batch-transfer", "--token", TOKEN, "--keypair", "k"])).rejects.toThrow(
      /required option '--recipients <csv>'/,
    );
  });
});

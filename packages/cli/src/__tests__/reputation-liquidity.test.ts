jest.mock("@nebgov/sdk", () => jest.requireActual("./sdkMock").mockSdk());

import { LiquidityClient, ReputationClient } from "@nebgov/sdk";
import { Networks, Transaction, TransactionBuilder, Account, Operation } from "@stellar/stellar-sdk";
import { stubClient } from "./sdkMock";
import {
  ACCOUNT,
  BASE_CONFIG,
  GOVERNOR,
  OTHER_ACCOUNT,
  SIGNER,
  contractAddress,
  runCli,
  useCleanEnvironment,
  writeKeypairFile,
} from "./helpers";

useCleanEnvironment();

const LIQUIDITY = contractAddress(50);
const INDEXER_URL = "https://indexer.example.com";

const config = {
  ...BASE_CONFIG,
  liquidityAddress: LIQUIDITY,
  indexerUrl: INDEXER_URL,
  defaultAccount: ACCOUNT,
};

describe("reputation", () => {
  it("get: reads the on-chain record against the governor", async () => {
    const client = stubClient(ReputationClient, {
      getProposerReputation: jest.fn().mockResolvedValue({ proposer: OTHER_ACCOUNT, totalProposals: 3, reputationScore: 40 }),
    });

    const result = await runCli(["reputation", "get", OTHER_ACCOUNT], config);

    expect(ReputationClient).toHaveBeenCalledWith(
      expect.objectContaining({ governorAddress: GOVERNOR, indexerUrl: INDEXER_URL, network: "testnet" }),
    );
    expect(client.getProposerReputation).toHaveBeenCalledWith(OTHER_ACCOUNT);
    expect(result.json()).toEqual({ proposer: OTHER_ACCOUNT, totalProposals: 3, reputationScore: 40 });
  });

  it("history: passes limit and offset", async () => {
    const client = stubClient(ReputationClient, { getScoreHistory: jest.fn().mockResolvedValue([]) });

    await runCli(["reputation", "history", OTHER_ACCOUNT, "--limit", "10", "--offset", "20"], config);

    expect(client.getScoreHistory).toHaveBeenCalledWith(OTHER_ACCOUNT, 10, 20);
  });

  it("threshold: reports the effective threshold", async () => {
    const client = stubClient(ReputationClient, { getEffectiveThreshold: jest.fn().mockResolvedValue(750n) });

    const result = await runCli(["reputation", "threshold", OTHER_ACCOUNT], config);

    expect(client.getEffectiveThreshold).toHaveBeenCalledWith(OTHER_ACCOUNT);
    expect(result.json()).toEqual({ proposer: OTHER_ACCOUNT, effectiveThreshold: "750" });
  });

  it("rejects an invalid address and a bad --limit", async () => {
    stubClient(ReputationClient, { getProposerReputation: jest.fn(), getScoreHistory: jest.fn() });
    await expect(runCli(["reputation", "get", "not-an-address"], config)).rejects.toThrow(/address/);
    await expect(runCli(["reputation", "history", OTHER_ACCOUNT, "--limit", "0"], config)).rejects.toThrow(
      /limit must be at least 1/,
    );
  });
});

describe("liquidity", () => {
  it("pool: queries the pair with the default account for simulation", async () => {
    const client = stubClient(LiquidityClient, {
      getPoolSafe: jest.fn().mockResolvedValue({ reserveA: 100n, reserveB: 200n, totalLpSupply: 300n, feeBps: 30 }),
    });

    const result = await runCli(["liquidity", "pool", "0", "1"], config);

    expect(LiquidityClient).toHaveBeenCalledWith(
      expect.objectContaining({ liquidityAddress: LIQUIDITY, simulationAccount: ACCOUNT, network: "testnet" }),
    );
    expect(client.getPoolSafe).toHaveBeenCalledWith(0, 1);
    expect(result.json()).toEqual({ reserveA: "100", reserveB: "200", totalLpSupply: "300", feeBps: 30 });
  });

  it("price: reports the scaled price", async () => {
    const client = stubClient(LiquidityClient, { getPrice: jest.fn().mockResolvedValue(20000n) });
    const result = await runCli(["liquidity", "price", "0", "1"], config);
    expect(client.getPrice).toHaveBeenCalledWith(0, 1);
    expect(result.json()).toEqual({ outcomeA: 0, outcomeB: 1, price: "20000" });
  });

  it("position: defaults the provider to the configured account", async () => {
    const client = stubClient(LiquidityClient, { getLpPosition: jest.fn().mockResolvedValue(55n) });
    const result = await runCli(["liquidity", "position", "0", "1"], config);
    expect(client.getLpPosition).toHaveBeenCalledWith(ACCOUNT, 0, 1);
    expect(result.json()).toEqual({ provider: ACCOUNT, lpTokens: "55" });
  });

  it("position: requires a provider when no account is configured", async () => {
    stubClient(LiquidityClient, { getLpPosition: jest.fn() });
    await expect(runCli(["liquidity", "position", "0", "1"], { ...config, defaultAccount: undefined })).rejects.toThrow(
      /Missing --provider/,
    );
  });

  it("requires liquidityAddress", async () => {
    stubClient(LiquidityClient, { getPrice: jest.fn() });
    await expect(runCli(["liquidity", "price", "0", "1"], { ...BASE_CONFIG })).rejects.toThrow(
      /Missing required config: liquidityAddress \(set NEBGOV_LIQUIDITY_ADDRESS/,
    );
  });

  it("add: signs the prepared XDR with the keypair and reports the hash", async () => {
    const client = stubClient(LiquidityClient, { addLiquidityWithSign: jest.fn().mockResolvedValue("HASH-ADD") });

    const result = await runCli(
      ["liquidity", "add", "0", "1", "--amount-a", "100", "--amount-b", "200", "--min-lp", "5", "--keypair", writeKeypairFile()],
      config,
    );

    expect(client.addLiquidityWithSign).toHaveBeenCalledTimes(1);
    const [publicKey, a, b, amountA, amountB, minLp, sign] = client.addLiquidityWithSign.mock.calls[0];
    expect([publicKey, a, b, amountA, amountB, minLp]).toEqual([SIGNER.publicKey(), 0, 1, 100n, 200n, 5n]);

    const unsigned = new TransactionBuilder(new Account(SIGNER.publicKey(), "1"), { fee: "100", networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.bumpSequence({ bumpTo: "10" }))
      .setTimeout(30)
      .build();
    const signed = TransactionBuilder.fromXDR(await sign(unsigned.toXDR()), Networks.TESTNET) as Transaction;
    expect(signed.signatures).toHaveLength(1);

    expect(result.json()).toMatchObject({ ok: true, amountA: "100", amountB: "200", hash: "HASH-ADD" });
  });

  it("remove: burns the LP tokens", async () => {
    const client = stubClient(LiquidityClient, { removeLiquidityWithSign: jest.fn().mockResolvedValue("HASH-RM") });

    const result = await runCli(
      ["liquidity", "remove", "0", "1", "--lp-tokens", "40", "--keypair", writeKeypairFile()],
      config,
    );

    const [publicKey, a, b, lpTokens] = client.removeLiquidityWithSign.mock.calls[0];
    expect([publicKey, a, b, lpTokens]).toEqual([SIGNER.publicKey(), 0, 1, 40n]);
    expect(result.json()).toMatchObject({ ok: true, lpTokens: "40", hash: "HASH-RM" });
  });

  it("swap: passes the amounts and slippage floor", async () => {
    const client = stubClient(LiquidityClient, { swapWithSign: jest.fn().mockResolvedValue("HASH-SWAP") });

    const result = await runCli(
      ["liquidity", "swap", "0", "1", "--amount-in", "10", "--min-out", "9", "--keypair", writeKeypairFile()],
      config,
    );

    const [publicKey, outcomeIn, outcomeOut, amountIn, minOut] = client.swapWithSign.mock.calls[0];
    expect([publicKey, outcomeIn, outcomeOut, amountIn, minOut]).toEqual([SIGNER.publicKey(), 0, 1, 10n, 9n]);
    expect(result.json()).toMatchObject({ ok: true, amountIn: "10", minAmountOut: "9", hash: "HASH-SWAP" });
  });

  it.each([
    [["add", "0", "1", "--amount-a", "100", "--amount-b", "200"], "liquidity.add"],
    [["remove", "0", "1", "--lp-tokens", "40"], "liquidity.remove"],
    [["swap", "0", "1", "--amount-in", "10"], "liquidity.swap"],
  ])("--dry-run %j prints the plan without submitting", async (args, action) => {
    const client = stubClient(LiquidityClient, {
      addLiquidityWithSign: jest.fn(),
      removeLiquidityWithSign: jest.fn(),
      swapWithSign: jest.fn(),
    });

    const result = await runCli(["--dry-run", "liquidity", ...args, "--keypair", "unused"], config);

    expect(client.addLiquidityWithSign).not.toHaveBeenCalled();
    expect(client.removeLiquidityWithSign).not.toHaveBeenCalled();
    expect(client.swapWithSign).not.toHaveBeenCalled();
    expect(result.json()).toMatchObject({ action });
  });

  it("rejects zero amounts and non-numeric outcomes", async () => {
    stubClient(LiquidityClient, { swapWithSign: jest.fn() });
    await expect(
      runCli(["liquidity", "swap", "0", "1", "--amount-in", "0", "--keypair", writeKeypairFile()], config),
    ).rejects.toThrow(/amount-in must be greater than zero/);
    await expect(runCli(["liquidity", "price", "x", "1"], config)).rejects.toThrow(/outcomeA/);
  });
});

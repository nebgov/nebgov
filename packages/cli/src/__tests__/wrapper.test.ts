jest.mock("@nebgov/sdk", () => jest.requireActual("./sdkMock").mockSdk());

import { WrapperClient } from "@nebgov/sdk";
import { stubClient } from "./sdkMock";
import {
  ACCOUNT,
  BASE_CONFIG,
  OTHER_ACCOUNT,
  SIGNER,
  contractAddress,
  runCli,
  useCleanEnvironment,
  writeKeypairFile,
} from "./helpers";

useCleanEnvironment();

const WRAPPER = contractAddress(16);

const config = {
  ...BASE_CONFIG,
  wrapperAddress: WRAPPER,
};

describe("wrapper", () => {
  describe("wrap", () => {
    it("deposits the amount with the keypair signer and reports the hash", async () => {
      const wrapper = stubClient(WrapperClient, { deposit: jest.fn().mockResolvedValue("HASH1") });

      const result = await runCli(
        ["wrapper", "wrap", "1000", "--keypair", writeKeypairFile()],
        config,
      );

      expect(WrapperClient).toHaveBeenCalledWith(
        expect.objectContaining({ wrapperAddress: WRAPPER, network: "testnet" }),
      );
      expect(wrapper.deposit).toHaveBeenCalledTimes(1);
      const [signer, amount] = wrapper.deposit.mock.calls[0];
      expect(signer.publicKey()).toBe(SIGNER.publicKey());
      expect(amount).toBe(1000n);
      expect(result.json()).toEqual({
        ok: true,
        amount: "1000",
        account: SIGNER.publicKey(),
        hash: "HASH1",
      });
    });

    it("--dry-run prints the plan without submitting", async () => {
      const wrapper = stubClient(WrapperClient, { deposit: jest.fn() });

      const result = await runCli(
        ["--dry-run", "wrapper", "wrap", "1000", "--keypair", "unused"],
        config,
      );

      expect(wrapper.deposit).not.toHaveBeenCalled();
      expect(result.json()).toEqual({ action: "wrapper.wrap", amount: "1000" });
    });

    it("rejects a zero amount, which the contract would refuse", async () => {
      stubClient(WrapperClient, { deposit: jest.fn() });

      await expect(
        runCli(["wrapper", "wrap", "0", "--keypair", writeKeypairFile()], config),
      ).rejects.toThrow("amount must be greater than zero");
    });

    it("rejects a non-integer amount before building a client", async () => {
      await expect(
        runCli(["wrapper", "wrap", "1.5", "--keypair", writeKeypairFile()], config),
      ).rejects.toThrow("amount must be a non-negative integer");
      expect(WrapperClient).not.toHaveBeenCalled();
    });
  });

  describe("unwrap", () => {
    it("withdraws the amount with the keypair signer", async () => {
      const wrapper = stubClient(WrapperClient, { withdraw: jest.fn().mockResolvedValue("HASH2") });

      const result = await runCli(
        ["wrapper", "unwrap", "250", "--keypair", writeKeypairFile()],
        config,
      );

      const [signer, amount] = wrapper.withdraw.mock.calls[0];
      expect(signer.publicKey()).toBe(SIGNER.publicKey());
      expect(amount).toBe(250n);
      expect(result.json()).toEqual({
        ok: true,
        amount: "250",
        account: SIGNER.publicKey(),
        hash: "HASH2",
      });
    });

    it("--dry-run prints the plan without submitting", async () => {
      const wrapper = stubClient(WrapperClient, { withdraw: jest.fn() });

      const result = await runCli(
        ["--dry-run", "wrapper", "unwrap", "250", "--keypair", "unused"],
        config,
      );

      expect(wrapper.withdraw).not.toHaveBeenCalled();
      expect(result.json()).toEqual({ action: "wrapper.unwrap", amount: "250" });
    });
  });

  describe("balance", () => {
    it("reports the deposited balance and voting power for an address", async () => {
      const wrapper = stubClient(WrapperClient, {
        getDepositorBalance: jest.fn().mockResolvedValue(2500n),
        getVotes: jest.fn().mockResolvedValue(100n),
      });

      const result = await runCli(["wrapper", "balance", ACCOUNT], config);

      expect(wrapper.getDepositorBalance).toHaveBeenCalledWith(ACCOUNT);
      expect(wrapper.getVotes).toHaveBeenCalledWith(ACCOUNT);
      expect(result.json()).toEqual({
        address: ACCOUNT,
        depositorBalance: "2500",
        votingPower: "100",
      });
    });

    it("falls back to the configured default account when no address is given", async () => {
      const wrapper = stubClient(WrapperClient, {
        getDepositorBalance: jest.fn().mockResolvedValue(0n),
        getVotes: jest.fn().mockResolvedValue(0n),
      });

      await runCli(["wrapper", "balance"], { ...config, defaultAccount: OTHER_ACCOUNT });

      expect(wrapper.getDepositorBalance).toHaveBeenCalledWith(OTHER_ACCOUNT);
    });

    it("requires an address when there is no default account", async () => {
      stubClient(WrapperClient, { getDepositorBalance: jest.fn(), getVotes: jest.fn() });

      await expect(runCli(["wrapper", "balance"], config)).rejects.toThrow(
        /Provide an address or set NEBGOV_DEFAULT_ACCOUNT/,
      );
    });

    it("rejects a malformed address", async () => {
      stubClient(WrapperClient, { getDepositorBalance: jest.fn(), getVotes: jest.fn() });

      await expect(runCli(["wrapper", "balance", "not-an-address"], config)).rejects.toThrow(
        /address must be a Stellar account/,
      );
    });
  });

  it("reads the address from NEBGOV_WRAPPER_ADDRESS and requires it", async () => {
    stubClient(WrapperClient, { getDepositorBalance: jest.fn(), getVotes: jest.fn() });

    await expect(runCli(["wrapper", "balance", ACCOUNT])).rejects.toThrow(
      /Missing required config: wrapperAddress \(set NEBGOV_WRAPPER_ADDRESS/,
    );

    process.env.NEBGOV_WRAPPER_ADDRESS = WRAPPER;
    await runCli(["wrapper", "balance", ACCOUNT]);
    expect(WrapperClient).toHaveBeenCalledWith(expect.objectContaining({ wrapperAddress: WRAPPER }));
  });
});

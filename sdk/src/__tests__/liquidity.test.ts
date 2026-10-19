var mockNativeToScVal = jest.fn();
var mockScValToNative = jest.fn();
var mockGetAccount = jest.fn();
var mockSimulateTransaction = jest.fn();

import { LiquidityClient } from "../liquidity";
import { TreasuryError } from "../errors";

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    nativeToScVal: mockNativeToScVal,
    scValToNative: mockScValToNative,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: jest.fn().mockImplementation(() => ({
        getAccount: mockGetAccount,
        simulateTransaction: mockSimulateTransaction,
      })),
      Api: {
        isSimulationError: jest.fn().mockReturnValue(false),
      },
    },
    Contract: jest.fn().mockImplementation((addr) => ({
      call: jest.fn().mockReturnValue({}),
      address: () => addr,
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({
        toXDR: jest.fn().mockReturnValue(""),
      }),
    })),
  };
});

describe("LiquidityClient", () => {
  let client: LiquidityClient;
  const validCAddr = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
  const validGAddr = "GBFUUXATVOGXGD4KS3I423QFZSPE4ZFOQ3TCJVWFUYSIPULXIRVRE2DT";

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccount.mockResolvedValue({ accountId: () => validGAddr, sequenceNumber: () => "1" });
    mockSimulateTransaction.mockResolvedValue({ result: { retval: {} } });

    client = new LiquidityClient({
      liquidityAddress: validCAddr,
      network: "testnet",
      simulationAccount: validGAddr,
    });
  });

  describe("getPoolSafe()", () => {
    it("returns the decoded pool when one exists", async () => {
      mockScValToNative.mockReturnValue({
        reserve_a: "1000000",
        reserve_b: "1000000",
        total_lp_supply: "1000000",
        fee_bps: 30,
      });

      const pool = await client.getPoolSafe(0, 1);

      expect(pool).not.toBeNull();
      expect(pool?.reserveA).toBe(1000000n);
      expect(pool?.reserveB).toBe(1000000n);
      expect(pool?.totalLpSupply).toBe(1000000n);
      expect(pool?.feeBps).toBe(30);
      expect(mockNativeToScVal).toHaveBeenCalledWith(0, { type: "u32" });
      expect(mockNativeToScVal).toHaveBeenCalledWith(1, { type: "u32" });
    });

    it("returns null when the contract returns no value", async () => {
      mockScValToNative.mockReturnValue(null);

      const pool = await client.getPoolSafe(0, 1);

      expect(pool).toBeNull();
    });

    it("returns null on simulation error instead of throwing", async () => {
      const { SorobanRpc } = jest.requireMock("@stellar/stellar-sdk") as {
        SorobanRpc: { Api: { isSimulationError: jest.Mock } };
      };
      SorobanRpc.Api.isSimulationError.mockReturnValueOnce(true);

      const pool = await client.getPoolSafe(0, 1);

      expect(pool).toBeNull();
    });
  });

  describe("getPool()", () => {
    it("returns the pool when it exists", async () => {
      mockScValToNative.mockReturnValue({
        reserve_a: "500",
        reserve_b: "500",
        total_lp_supply: "500",
        fee_bps: 10,
      });

      const pool = await client.getPool(0, 1);
      expect(pool.feeBps).toBe(10);
    });

    it("throws a TreasuryError when the pool does not exist", async () => {
      const { SorobanRpc } = jest.requireMock("@stellar/stellar-sdk") as {
        SorobanRpc: { Api: { isSimulationError: jest.Mock } };
      };
      SorobanRpc.Api.isSimulationError.mockReturnValueOnce(true);

      await expect(client.getPool(0, 1)).rejects.toBeInstanceOf(TreasuryError);
    });
  });

  describe("getLpPosition()", () => {
    it("returns the provider's LP token balance", async () => {
      mockScValToNative.mockReturnValue(750n);

      const position = await client.getLpPosition(validGAddr, 0, 1);

      expect(position).toBe(750n);
      expect(mockNativeToScVal).toHaveBeenCalledWith(validGAddr, { type: "address" });
      expect(mockNativeToScVal).toHaveBeenCalledWith(0, { type: "u32" });
      expect(mockNativeToScVal).toHaveBeenCalledWith(1, { type: "u32" });
    });

    it("throws a TreasuryError when the simulation fails", async () => {
      const { SorobanRpc } = jest.requireMock("@stellar/stellar-sdk") as {
        SorobanRpc: { Api: { isSimulationError: jest.Mock } };
      };
      SorobanRpc.Api.isSimulationError.mockReturnValueOnce(true);

      await expect(client.getLpPosition(validGAddr, 0, 1)).rejects.toBeInstanceOf(TreasuryError);
    });
  });

  describe("getPrice()", () => {
    it("returns the scaled reserve ratio", async () => {
      mockScValToNative.mockReturnValue(20000n);

      await expect(client.getPrice(0, 1)).resolves.toBe(20000n);
    });
  });

  describe("write methods", () => {
    const signedXdr = "SIGNED";
    let server: {
      getAccount: jest.Mock;
      prepareTransaction: jest.Mock;
      sendTransaction: jest.Mock;
    };
    let sign: jest.Mock;

    beforeEach(() => {
      const { TransactionBuilder } = jest.requireMock("@stellar/stellar-sdk") as {
        TransactionBuilder: { fromXDR: jest.Mock };
      };
      TransactionBuilder.fromXDR = jest.fn().mockReturnValue({ signed: true });

      server = {
        getAccount: jest.fn().mockResolvedValue({ accountId: () => validGAddr, sequenceNumber: () => "1" }),
        prepareTransaction: jest.fn().mockResolvedValue({ toXDR: () => "UNSIGNED" }),
        sendTransaction: jest.fn().mockResolvedValue({ status: "PENDING", hash: "tx-hash" }),
      };
      Object.defineProperty(client, "server", { value: server });
      sign = jest.fn().mockResolvedValue(signedXdr);
    });

    it("addLiquidityWithSign submits add_liquidity with the signed transaction", async () => {
      const hash = await client.addLiquidityWithSign(validGAddr, 0, 1, 100n, 200n, 50n, sign);

      expect(hash).toBe("tx-hash");
      expect(sign).toHaveBeenCalledWith("UNSIGNED");
      expect(server.sendTransaction).toHaveBeenCalledWith({ signed: true });
      expect(mockNativeToScVal).toHaveBeenCalledWith(100n, { type: "i128" });
      expect(mockNativeToScVal).toHaveBeenCalledWith(200n, { type: "i128" });
      expect(mockNativeToScVal).toHaveBeenCalledWith(50n, { type: "i128" });
    });

    it("removeLiquidityWithSign passes the LP token amount", async () => {
      await client.removeLiquidityWithSign(validGAddr, 0, 1, 75n, sign);

      expect(mockNativeToScVal).toHaveBeenCalledWith(75n, { type: "i128" });
      expect(server.sendTransaction).toHaveBeenCalled();
    });

    it("swapWithSign passes the input and minimum output amounts", async () => {
      await client.swapWithSign(validGAddr, 0, 1, 30n, 25n, sign);

      expect(mockNativeToScVal).toHaveBeenCalledWith(30n, { type: "i128" });
      expect(mockNativeToScVal).toHaveBeenCalledWith(25n, { type: "i128" });
    });

    it("throws when the network rejects the transaction", async () => {
      server.sendTransaction.mockResolvedValueOnce({ status: "ERROR", hash: "tx-hash" });

      await expect(client.swapWithSign(validGAddr, 0, 1, 30n, 25n, sign)).rejects.toThrow(
        /swap transaction was rejected/,
      );
    });
  });
});

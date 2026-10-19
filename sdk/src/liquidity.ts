import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { LiquidityConfig, Pool } from "./types";
import { TreasuryError, TreasuryErrorCode } from "./errors";
import { createRetry, isNetworkError, type RetryFunction } from "./utils";
import { getRpcUrl, getNetworkPassphrase } from "./network";

function decodePool(raw: unknown): Pool {
  const p = raw as {
    reserve_a: bigint | number | string;
    reserve_b: bigint | number | string;
    total_lp_supply: bigint | number | string;
    fee_bps: number | bigint | string;
  };
  return {
    reserveA: BigInt(p.reserve_a),
    reserveB: BigInt(p.reserve_b),
    totalLpSupply: BigInt(p.total_lp_supply),
    feeBps: Number(p.fee_bps),
  };
}

/**
 * LiquidityClient — read/query a deployed NebGov liquidity pool contract.
 *
 * @example
 * const client = new LiquidityClient({
 *   liquidityAddress: "CABC...",
 *   network: "testnet",
 * });
 *
 * const pool = await client.getPoolSafe(0, 1);
 * if (!pool) {
 *   // show "Initialize Pool" CTA
 * }
 */
export class LiquidityClient {
  private readonly config: LiquidityConfig;
  private readonly server: SorobanRpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;
  private readonly retry: RetryFunction;

  constructor(config: LiquidityConfig) {
    this.config = config;
    const rpcUrl = getRpcUrl(config.network, config.rpcUrl);
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    this.contract = new Contract(config.liquidityAddress);
    this.networkPassphrase = getNetworkPassphrase(config.network);
    this.retry = createRetry(config, { retryOn: isNetworkError });
  }

  private readAccount(fallback?: string): string {
    const account = this.config.simulationAccount ?? fallback;
    if (!account) {
      throw new TreasuryError(
        TreasuryErrorCode.InvalidArguments,
        "LiquidityClient read methods require simulationAccount in LiquidityConfig",
      );
    }
    return account;
  }

  /**
   * Fetch the current pool state. Throws if the pool has never been
   * initialized — prefer {@link getPoolSafe} when the pool's existence is
   * not guaranteed (e.g. before showing add-liquidity or swap UI).
   */
  async getPool(outcomeA: number, outcomeB: number): Promise<Pool> {
    const pool = await this.getPoolSafe(outcomeA, outcomeB);
    if (!pool) {
      throw new TreasuryError(
        TreasuryErrorCode.InvalidArguments,
        `Pool not found for outcomes (${outcomeA}, ${outcomeB})`,
      );
    }
    return pool;
  }

  /**
   * Fetch the current pool state without throwing if the pool does not
   * exist. Calls the on-chain `get_pool_safe` read function.
   *
   * @returns The pool state, or `null` if no pool has been created for this
   * outcome pair.
   */
  async getPoolSafe(outcomeA: number, outcomeB: number): Promise<Pool | null> {
    return this.retry(async () => {
      const result = await this.server.simulateTransaction(
        new TransactionBuilder(
          await this.server.getAccount(this.readAccount()),
          { fee: BASE_FEE, networkPassphrase: this.networkPassphrase },
        )
          .addOperation(
            this.contract.call(
              "get_pool_safe",
              nativeToScVal(outcomeA, { type: "u32" }),
              nativeToScVal(outcomeB, { type: "u32" }),
            ),
          )
          .setTimeout(30)
          .build(),
      );

      if (SorobanRpc.Api.isSimulationError(result)) return null;
      const raw = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
        .result?.retval;
      if (!raw) return null;

      const decoded = scValToNative(raw);
      if (decoded === null || decoded === undefined) return null;
      return decodePool(decoded);
    });
  }

  /**
   * LP tokens `provider` holds in the pool for an outcome pair. Returns `0n`
   * when the provider has no position.
   */
  async getLpPosition(provider: string, outcomeA: number, outcomeB: number): Promise<bigint> {
    const value = await this.readNative("get_lp_position", [
      nativeToScVal(provider, { type: "address" }),
      nativeToScVal(outcomeA, { type: "u32" }),
      nativeToScVal(outcomeB, { type: "u32" }),
    ]);
    return BigInt(value as bigint | number | string);
  }

  /**
   * Current pool price as `reserve_b / reserve_a` scaled by 10,000. Throws if
   * the pool does not exist, since the contract panics in that case.
   */
  async getPrice(outcomeA: number, outcomeB: number): Promise<bigint> {
    const value = await this.readNative("get_price", [
      nativeToScVal(outcomeA, { type: "u32" }),
      nativeToScVal(outcomeB, { type: "u32" }),
    ]);
    return BigInt(value as bigint | number | string);
  }

  /**
   * Deposit `amountA` and `amountB` into a pool and receive LP tokens. The
   * amounts map to `outcomeA` and `outcomeB` respectively.
   *
   * @param signUnsignedXdr Signs the prepared transaction XDR, e.g. a wallet's `signTransaction`.
   * @returns The transaction hash.
   */
  async addLiquidityWithSign(
    signerPublicKey: string,
    outcomeA: number,
    outcomeB: number,
    amountA: bigint,
    amountB: bigint,
    minLpTokensOut: bigint,
    signUnsignedXdr: (xdr: string) => Promise<string>,
  ): Promise<string> {
    return this.submitWithSign(
      signerPublicKey,
      "add_liquidity",
      [
        nativeToScVal(signerPublicKey, { type: "address" }),
        nativeToScVal(outcomeA, { type: "u32" }),
        nativeToScVal(outcomeB, { type: "u32" }),
        nativeToScVal(amountA, { type: "i128" }),
        nativeToScVal(amountB, { type: "i128" }),
        nativeToScVal(minLpTokensOut, { type: "i128" }),
      ],
      signUnsignedXdr,
    );
  }

  /**
   * Burn `lpTokens` from a pool and withdraw the underlying reserves.
   *
   * @returns The transaction hash.
   */
  async removeLiquidityWithSign(
    signerPublicKey: string,
    outcomeA: number,
    outcomeB: number,
    lpTokens: bigint,
    signUnsignedXdr: (xdr: string) => Promise<string>,
  ): Promise<string> {
    return this.submitWithSign(
      signerPublicKey,
      "remove_liquidity",
      [
        nativeToScVal(signerPublicKey, { type: "address" }),
        nativeToScVal(outcomeA, { type: "u32" }),
        nativeToScVal(outcomeB, { type: "u32" }),
        nativeToScVal(lpTokens, { type: "i128" }),
      ],
      signUnsignedXdr,
    );
  }

  /**
   * Swap `amountIn` of `outcomeIn` for at least `minAmountOut` of `outcomeOut`.
   *
   * @returns The transaction hash.
   */
  async swapWithSign(
    signerPublicKey: string,
    outcomeIn: number,
    outcomeOut: number,
    amountIn: bigint,
    minAmountOut: bigint,
    signUnsignedXdr: (xdr: string) => Promise<string>,
  ): Promise<string> {
    return this.submitWithSign(
      signerPublicKey,
      "swap",
      [
        nativeToScVal(signerPublicKey, { type: "address" }),
        nativeToScVal(outcomeIn, { type: "u32" }),
        nativeToScVal(outcomeOut, { type: "u32" }),
        nativeToScVal(amountIn, { type: "i128" }),
        nativeToScVal(minAmountOut, { type: "i128" }),
      ],
      signUnsignedXdr,
    );
  }

  /** Simulate a read-only contract call and return the decoded result. */
  private async readNative(method: string, args: xdr.ScVal[]): Promise<unknown> {
    return this.retry(async () => {
      const result = await this.server.simulateTransaction(
        new TransactionBuilder(
          await this.server.getAccount(this.readAccount()),
          { fee: BASE_FEE, networkPassphrase: this.networkPassphrase },
        )
          .addOperation(this.contract.call(method, ...args))
          .setTimeout(30)
          .build(),
      );

      if (SorobanRpc.Api.isSimulationError(result)) {
        throw new TreasuryError(
          TreasuryErrorCode.InvalidArguments,
          `${method} simulation failed`,
        );
      }
      const raw = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
        .result?.retval;
      if (!raw) {
        throw new TreasuryError(
          TreasuryErrorCode.InvalidArguments,
          `${method} returned no value`,
        );
      }
      return scValToNative(raw);
    });
  }

  /**
   * Build, sign and submit a state-changing call. Not retried: a retry after
   * an ambiguous submission could double-spend.
   */
  private async submitWithSign(
    signerPublicKey: string,
    method: string,
    args: xdr.ScVal[],
    signUnsignedXdr: (xdr: string) => Promise<string>,
  ): Promise<string> {
    const account = await this.server.getAccount(signerPublicKey);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    const signedXdr = await signUnsignedXdr(prepared.toXDR());
    const signed = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);

    const result = await this.server.sendTransaction(signed);
    if (result.status === "ERROR") {
      throw new Error(`${method} transaction was rejected by the network`);
    }
    return result.hash;
  }
}

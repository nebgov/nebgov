"use client";

import { useMemo, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { LiquidityClient, type Network, type Pool } from "@nebgov/sdk";
import { useWallet } from "../../lib/wallet-context";
import { useGovernorConfig } from "../../hooks/useGovernorConfig";
import { parseDecimalToStroops } from "../../lib/parseDecimalToStroops";
import { formatVotingPower } from "../../lib/utils";

const MAX_OUTCOME_ID = 4_294_967_295;
const PRICE_SCALE = 10_000;

interface PoolSnapshot {
  /** Outcome ids in the order the pool was loaded with. */
  outcomeA: number;
  outcomeB: number;
  /** Lower and higher outcome ids: the order the contract stores reserves in. */
  lo: number;
  hi: number;
  pool: Pool;
  /** `reserve_b / reserve_a` scaled by {@link PRICE_SCALE}. */
  price: bigint;
  lpPosition: bigint;
}

function parseOutcomeId(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed <= MAX_OUTCOME_ID ? parsed : null;
}

function parseDecimal(value: string, divisor: number, field: string): bigint {
  const parsed = parseDecimalToStroops(value, divisor);
  if (parsed instanceof Error) throw new Error(`${field}: ${parsed.message}`);
  return parsed;
}

function parsePositiveAmount(value: string, divisor: number, field: string): bigint {
  const parsed = parseDecimal(value, divisor, field);
  if (parsed <= 0n) throw new Error(`${field} must be greater than zero`);
  return parsed;
}

function messageFor(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export default function LiquidityPage() {
  const { publicKey, connect, signTransaction } = useWallet();
  const { decimals, divisor } = useGovernorConfig();

  const liquidityAddress = process.env.NEXT_PUBLIC_LIQUIDITY_ADDRESS ?? "";
  const network = (process.env.NEXT_PUBLIC_NETWORK || "testnet") as Network;

  const client = useMemo(
    () =>
      liquidityAddress && publicKey
        ? new LiquidityClient({ liquidityAddress, network, simulationAccount: publicKey })
        : null,
    [liquidityAddress, network, publicKey],
  );

  const [outcomeAInput, setOutcomeAInput] = useState("0");
  const [outcomeBInput, setOutcomeBInput] = useState("1");
  const [snapshot, setSnapshot] = useState<PoolSnapshot | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [addAmountA, setAddAmountA] = useState("");
  const [addAmountB, setAddAmountB] = useState("");
  const [addMinLp, setAddMinLp] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [removeLp, setRemoveLp] = useState("");
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const [swapInIsLo, setSwapInIsLo] = useState(true);
  const [swapAmountIn, setSwapAmountIn] = useState("");
  const [swapMinOut, setSwapMinOut] = useState("");
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);

  const busy = loading || adding || removing || swapping;

  async function loadPool() {
    const a = parseOutcomeId(outcomeAInput);
    const b = parseOutcomeId(outcomeBInput);
    if (a === null || b === null) {
      setLoadError("Outcome ids must be whole numbers.");
      return;
    }
    if (a === b) {
      setLoadError("Choose two different outcomes.");
      return;
    }
    if (!client || !publicKey) return;

    setLoading(true);
    setLoadError(null);
    setNotFound(false);
    try {
      const pool = await client.getPoolSafe(a, b);
      if (!pool) {
        setSnapshot(null);
        setNotFound(true);
        return;
      }
      const [price, lpPosition] = await Promise.all([
        client.getPrice(a, b),
        client.getLpPosition(publicKey, a, b),
      ]);
      setSnapshot({
        outcomeA: a,
        outcomeB: b,
        lo: Math.min(a, b),
        hi: Math.max(a, b),
        pool,
        price,
        lpPosition,
      });
    } catch (err) {
      setSnapshot(null);
      setLoadError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!client || !publicKey || !snapshot) return;

    let amountA: bigint;
    let amountB: bigint;
    let minLp: bigint;
    try {
      amountA = parsePositiveAmount(addAmountA, divisor, `Amount for outcome ${snapshot.outcomeA}`);
      amountB = parsePositiveAmount(addAmountB, divisor, `Amount for outcome ${snapshot.outcomeB}`);
      minLp = addMinLp.trim() === "" ? 0n : parseDecimal(addMinLp, divisor, "Minimum LP tokens");
    } catch (err) {
      setAddError(messageFor(err));
      return;
    }

    setAdding(true);
    setAddError(null);
    try {
      const hash = await client.addLiquidityWithSign(
        publicKey,
        snapshot.outcomeA,
        snapshot.outcomeB,
        amountA,
        amountB,
        minLp,
        signTransaction,
      );
      toast.success(`Liquidity added (${hash.slice(0, 8)}…)`);
      setAddAmountA("");
      setAddAmountB("");
      setAddMinLp("");
      await loadPool();
    } catch (err) {
      setAddError(messageFor(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(e: FormEvent) {
    e.preventDefault();
    if (!client || !publicKey || !snapshot) return;

    let lpTokens: bigint;
    try {
      lpTokens = parsePositiveAmount(removeLp, divisor, "LP tokens");
    } catch (err) {
      setRemoveError(messageFor(err));
      return;
    }
    if (lpTokens > snapshot.lpPosition) {
      setRemoveError("Amount exceeds your LP position in this pool");
      return;
    }

    setRemoving(true);
    setRemoveError(null);
    try {
      const hash = await client.removeLiquidityWithSign(
        publicKey,
        snapshot.outcomeA,
        snapshot.outcomeB,
        lpTokens,
        signTransaction,
      );
      toast.success(`Liquidity removed (${hash.slice(0, 8)}…)`);
      setRemoveLp("");
      await loadPool();
    } catch (err) {
      setRemoveError(messageFor(err));
    } finally {
      setRemoving(false);
    }
  }

  async function handleSwap(e: FormEvent) {
    e.preventDefault();
    if (!client || !publicKey || !snapshot) return;

    const outcomeIn = swapInIsLo ? snapshot.lo : snapshot.hi;
    const outcomeOut = swapInIsLo ? snapshot.hi : snapshot.lo;

    let amountIn: bigint;
    let minOut: bigint;
    try {
      amountIn = parsePositiveAmount(swapAmountIn, divisor, "Amount in");
      minOut = swapMinOut.trim() === "" ? 0n : parseDecimal(swapMinOut, divisor, "Minimum amount out");
    } catch (err) {
      setSwapError(messageFor(err));
      return;
    }

    setSwapping(true);
    setSwapError(null);
    try {
      const hash = await client.swapWithSign(
        publicKey,
        outcomeIn,
        outcomeOut,
        amountIn,
        minOut,
        signTransaction,
      );
      toast.success(`Swap submitted (${hash.slice(0, 8)}…)`);
      setSwapAmountIn("");
      setSwapMinOut("");
      await loadPool();
    } catch (err) {
      setSwapError(messageFor(err));
    } finally {
      setSwapping(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder-gray-400";
  const buttonClass =
    "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
  const errorClass =
    "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200";

  return (
    <div className="space-y-8 py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-50">Liquidity Pools</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Provide liquidity to outcome pairs, withdraw it, or swap between outcomes
        </p>
      </div>

      {!liquidityAddress ? (
        <div className={errorClass}>
          Set <span className="font-mono">NEXT_PUBLIC_LIQUIDITY_ADDRESS</span> to use liquidity pools.
        </div>
      ) : !publicKey ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-800 dark:bg-slate-900/80">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            Connect your wallet to view pools and manage your liquidity
          </p>
          <button onClick={connect} className={`${buttonClass} mt-3`}>
            Connect Wallet
          </button>
        </div>
      ) : (
        <>
          <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Select a pool</h2>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <label htmlFor="outcome-a" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Outcome A
                </label>
                <input
                  id="outcome-a"
                  type="text"
                  inputMode="numeric"
                  value={outcomeAInput}
                  onChange={(e) => setOutcomeAInput(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="outcome-b" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Outcome B
                </label>
                <input
                  id="outcome-b"
                  type="text"
                  inputMode="numeric"
                  value={outcomeBInput}
                  onChange={(e) => setOutcomeBInput(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button onClick={loadPool} disabled={busy} className={buttonClass}>
                {loading ? "Loading..." : "Load pool"}
              </button>
            </div>
            {loadError && <p role="alert" className={errorClass}>{loadError}</p>}
            {notFound && !loadError && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No pool exists for this pair yet.
              </p>
            )}
          </section>

          {snapshot && (
            <>
              <section className="grid gap-4 rounded-xl border border-gray-200 bg-white p-6 sm:grid-cols-2 dark:border-gray-800 dark:bg-gray-950">
                <Stat
                  label={`Reserve (outcome ${snapshot.lo})`}
                  value={formatVotingPower(snapshot.pool.reserveA, decimals)}
                />
                <Stat
                  label={`Reserve (outcome ${snapshot.hi})`}
                  value={formatVotingPower(snapshot.pool.reserveB, decimals)}
                />
                <Stat
                  label={`Price (outcome ${snapshot.hi} per outcome ${snapshot.lo})`}
                  value={(Number(snapshot.price) / PRICE_SCALE).toFixed(4)}
                />
                <Stat label="Fee" value={`${snapshot.pool.feeBps / 100}%`} />
                <Stat
                  label="Total LP supply"
                  value={formatVotingPower(snapshot.pool.totalLpSupply, decimals)}
                />
                <Stat
                  label="Your LP position"
                  value={formatVotingPower(snapshot.lpPosition, decimals)}
                />
              </section>

              <div className="grid gap-8 lg:grid-cols-3">
                <form onSubmit={handleAdd} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Add liquidity</h2>
                  <div>
                    <label htmlFor="add-a" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Amount for outcome {snapshot.outcomeA}
                    </label>
                    <input id="add-a" type="text" value={addAmountA} onChange={(e) => setAddAmountA(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="add-b" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Amount for outcome {snapshot.outcomeB}
                    </label>
                    <input id="add-b" type="text" value={addAmountB} onChange={(e) => setAddAmountB(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="add-min-lp" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Minimum LP tokens (optional)
                    </label>
                    <input id="add-min-lp" type="text" value={addMinLp} onChange={(e) => setAddMinLp(e.target.value)} className={inputClass} />
                  </div>
                  {addError && <p role="alert" className={errorClass}>{addError}</p>}
                  <button type="submit" disabled={busy} className={buttonClass}>
                    {adding ? "Adding..." : "Add liquidity"}
                  </button>
                </form>

                <form onSubmit={handleRemove} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Remove liquidity</h2>
                  <div>
                    <label htmlFor="remove-lp" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      LP tokens to burn
                    </label>
                    <input id="remove-lp" type="text" value={removeLp} onChange={(e) => setRemoveLp(e.target.value)} className={inputClass} />
                  </div>
                  {removeError && <p role="alert" className={errorClass}>{removeError}</p>}
                  <button
                    type="submit"
                    disabled={busy || snapshot.lpPosition === 0n}
                    className={buttonClass}
                  >
                    {removing ? "Removing..." : "Remove liquidity"}
                  </button>
                </form>

                <form onSubmit={handleSwap} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Swap</h2>
                  <div>
                    <label htmlFor="swap-direction" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Direction
                    </label>
                    <select
                      id="swap-direction"
                      value={swapInIsLo ? "lo" : "hi"}
                      onChange={(e) => setSwapInIsLo(e.target.value === "lo")}
                      className={inputClass}
                    >
                      <option value="lo">Outcome {snapshot.lo} to outcome {snapshot.hi}</option>
                      <option value="hi">Outcome {snapshot.hi} to outcome {snapshot.lo}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="swap-in" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Amount in
                    </label>
                    <input id="swap-in" type="text" value={swapAmountIn} onChange={(e) => setSwapAmountIn(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="swap-min-out" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Minimum amount out (optional)
                    </label>
                    <input id="swap-min-out" type="text" value={swapMinOut} onChange={(e) => setSwapMinOut(e.target.value)} className={inputClass} />
                  </div>
                  {swapError && <p role="alert" className={errorClass}>{swapError}</p>}
                  <button type="submit" disabled={busy} className={buttonClass}>
                    {swapping ? "Swapping..." : "Swap"}
                  </button>
                </form>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">{value}</p>
    </div>
  );
}

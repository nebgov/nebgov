"use client";

import { useState } from "react";
import { useWallet } from "../../lib/wallet-context";
import { useVoteEscrow } from "../../hooks/useVoteEscrow";
import { useGovernorConfig } from "../../hooks/useGovernorConfig";
import { LockCard } from "../../components/LockCard";

type PreviewLock = {
  amount: bigint;
  start_ledger: number;
  end_ledger: number;
  initial_voting_power: bigint;
};

function computeDecayedPowerPreview(lock: PreviewLock, currentLedger: number): bigint {
  // Mirrors contracts/vote-escrow/src/lib.rs `compute_decayed_power` (lines 552-579).
  if (currentLedger >= lock.end_ledger) return lock.amount;
  if (currentLedger < lock.start_ledger) return 0n;

  const duration = BigInt(lock.end_ledger - lock.start_ledger);
  if (duration === 0n) return lock.amount;

  const remaining = BigInt(lock.end_ledger - currentLedger);
  const boost = lock.initial_voting_power - lock.amount;
  const decayedBoost = (boost * remaining) / duration;

  return lock.amount + decayedBoost;
}

export default function VoteEscrowPage() {
  const { publicKey, connect } = useWallet();
  const { lock, votingPower, stats, loading, error } = useVoteEscrow(publicKey);

  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; duration?: string }>({});
  const { divisor } = useGovernorConfig();
  const MIN_LOCK = Number(process.env.NEXT_PUBLIC_MIN_LOCK_DURATION || 0);
  const MAX_LOCK = Number(process.env.NEXT_PUBLIC_MAX_LOCK_DURATION || 99999999);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"create" | "manage">("create");

  const initialVotingPowerPreview =
    lock !== null ? computeDecayedPowerPreview(lock, lock.start_ledger) : null;
  const maturityVotingPowerPreview =
    lock !== null ? computeDecayedPowerPreview(lock, lock.end_ledger) : null;

  return (
    <div className="space-y-8 py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-50">Vote Escrow</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Lock tokens for enhanced voting power with time-based decay
        </p>
      </div>

      {!publicKey ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-800 dark:bg-slate-900/80">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            Connect your wallet to view or create a vote-escrow lock
          </p>
          <button
            onClick={connect}
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Connect Wallet
          </button>
        </div>
      ) : (
      <>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-6 flex gap-4 border-b border-gray-200 dark:border-gray-800">
              <button
                onClick={() => setActiveTab("create")}
                className={`pb-4 font-medium transition-colors ${
                  activeTab === "create"
                    ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
                }`}
              >
                Create Lock
              </button>
              <button
                onClick={() => setActiveTab("manage")}
                className={`pb-4 font-medium transition-colors ${
                  activeTab === "manage"
                    ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
                }`}
              >
                Manage Lock
              </button>
            </div>

            {activeTab === "create" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Amount
                  </label>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onBlur={() => {
                      const parsed = parseDecimalToStroops(amount, divisor);
                      setErrors((s) => ({ ...s, amount: parsed instanceof Error ? parsed.message : undefined }));
                    }}
                    placeholder="Enter amount to lock"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder-gray-400"
                  />
                  {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Lock Duration (Ledgers)
                  </label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => {
                      setDuration(e.target.value);
                      const n = Number(e.target.value || 0);
                      let msg: string | undefined;
                      if (!Number.isFinite(n) || n <= 0) msg = "Duration must be a positive integer";
                      else if (n < MIN_LOCK) msg = `Minimum duration is ${MIN_LOCK} ledgers`;
                      else if (n > MAX_LOCK) msg = `Maximum duration is ${MAX_LOCK} ledgers`;
                      setErrors((s) => ({ ...s, duration: msg }));
                    }}
                    placeholder="Enter lock duration in ledgers"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder-gray-400"
                  />
                  {errors.duration && <p className="mt-1 text-sm text-red-600">{errors.duration}</p>}
                </div>

                {amount && duration && (
                  <div className="space-y-2 rounded-lg bg-blue-50 p-4 dark:bg-blue-950">
                    <p className="text-sm text-blue-900 dark:text-blue-200">
                      You will lock <span className="font-semibold">{amount} tokens</span> for{" "}
                      <span className="font-semibold">{duration} ledgers</span>
                    </p>
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      Your voting boost decays linearly during the lock, from the initial
                      boosted power at lock start down to your base amount at maturity. After
                      withdrawal, voting power becomes zero.
                    </p>
                    {lock && initialVotingPowerPreview !== null && maturityVotingPowerPreview !== null && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <p className="text-xs text-blue-800 dark:text-blue-300">
                          Initial voting power: <span className="font-semibold">{initialVotingPowerPreview.toString()}</span>
                        </p>
                        <p className="text-xs text-blue-800 dark:text-blue-300">
                          Voting power at maturity: <span className="font-semibold">{maturityVotingPowerPreview.toString()}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={async () => {
                    if (!pk) {
                      await connect();
                      return;
                    }
                    const client = buildVoteEscrowClient();
                    if (!client) {
                      toast.error("Vote escrow is not configured for this deployment.");
                      return;
                    }

                    const parsed = parseDecimalToStroops(amount, divisor);
                    if (parsed instanceof Error) {
                      setErrors((s) => ({ ...s, amount: parsed.message }));
                      return;
                    }
                    const dur = Number(duration || 0);
                    if (!Number.isInteger(dur) || dur <= 0) {
                      setErrors((s) => ({ ...s, duration: "Invalid duration" }));
                      return;
                    }
                    if (errors.amount || errors.duration) return;

                    setBusy(true);
                    try {
                      const hash = await client.createLockWithSign(pk, parsed, dur, signTransaction);
                      toast.success(
                        <span>
                          Lock created — <a className="underline" href={`https://explorer.stellar.org/tx/${hash}`}>view</a>
                        </span>,
                      );
                      setAmount("");
                      setDuration("");
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : "Create lock failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? "Creating…" : "Create Lock"}
                </button>
              </div>
            )}

            {activeTab === "manage" && (
              <div className="space-y-4">
                {lock ? (
                  <>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Manage your existing lock below
                    </p>
                    <button
                      onClick={async () => {
                        if (!pk) {
                          await connect();
                          return;
                        }
                        const client = buildVoteEscrowClient();
                        if (!client) {
                          toast.error("Vote escrow is not configured for this deployment.");
                          return;
                        }
                        setBusy(true);
                        try {
                          const hash = await client.increaseLockAmountWithSign(
                            pk,
                            BigInt(amount || "0"),
                            signTransaction,
                          );
                          toast.success(
                            <span>
                              Increased — <a className="underline" href={`https://explorer.stellar.org/tx/${hash}`}>view</a>
                            </span>,
                          );
                        } catch (e: unknown) {
                          toast.error(e instanceof Error ? e.message : "Increase failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      disabled={busy}
                      className="w-full rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition-colors hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 disabled:opacity-50"
                    >
                      {busy ? "Processing…" : "Increase Amount"}
                    </button>

                    <button
                      onClick={async () => {
                        if (!pk) {
                          await connect();
                          return;
                        }
                        const client = buildVoteEscrowClient();
                        if (!client) {
                          toast.error("Vote escrow is not configured for this deployment.");
                          return;
                        }
                        setBusy(true);
                        try {
                          const newEnd = Number(duration || 0);
                          const hash = await client.extendLockWithSign(pk, newEnd, signTransaction);
                          toast.success(
                            <span>
                              Extended — <a className="underline" href={`https://explorer.stellar.org/tx/${hash}`}>view</a>
                            </span>,
                          );
                        } catch (e: unknown) {
                          toast.error(e instanceof Error ? e.message : "Extend failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      disabled={busy}
                      className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 disabled:opacity-50"
                    >
                      {busy ? "Processing…" : "Extend Lock"}
                    </button>

                    <button
                      onClick={async () => {
                        if (!pk) {
                          await connect();
                          return;
                        }
                        const client = buildVoteEscrowClient();
                        if (!client) {
                          toast.error("Vote escrow is not configured for this deployment.");
                          return;
                        }
                        setBusy(true);
                        try {
                          const hash = await client.withdrawWithSign(pk, signTransaction);
                          toast.success(
                            <span>
                              Withdrawn — <a className="underline" href={`https://explorer.stellar.org/tx/${hash}`}>view</a>
                            </span>,
                          );
                        } catch (e: unknown) {
                          toast.error(e instanceof Error ? e.message : "Withdraw failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      disabled={busy}
                      className="w-full rounded-lg bg-orange-600 px-4 py-2 font-medium text-white transition-colors hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700 disabled:opacity-50"
                    >
                      {busy ? "Processing…" : "Withdraw"}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    You don&apos;t have an active lock. Create one to get started.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <LockCard lock={lock || null} currentVotingPower={votingPower} loading={loading} />
        </div>
      </div>

      {stats && (
        // Only total_locked is rendered here — the contract has no
        // entrypoint that can supply an active-lock count or average
        // duration, so those tiles were removed rather than ship fixed
        // zeros (#1257).
        <div className="max-w-xs rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-sm text-gray-600 dark:text-gray-400">Total Locked</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-50">
            {(stats.total_locked || 0n).toString()}
          </p>
        </div>
      )}
      </>
      )}
    </div>
  );
}

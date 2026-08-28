"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "../../../lib/wallet-context";
import { ConvictionVotingClient } from "@nebgov/sdk";
import { readGovernorConfig } from "../../../lib/nebgov-env";

interface Snapshot { ledger: number; conviction: bigint }

export default function ConvictionProposalPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL;
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const { isConnected, publicKey, signTransaction } = useWallet();
  const [stakeAmount, setStakeAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const client = useMemo(() => {
    const config = readGovernorConfig();
    if (!config?.convictionVotingAddress) return null;
    return new ConvictionVotingClient(config);
  }, []);

  const fetchData = () => {
    if (!indexerUrl) return;
    void Promise.all([
      fetch(`${indexerUrl}/conviction/proposals/${id}`).then((r) => r.json()),
      fetch(`${indexerUrl}/conviction/proposals/${id}/conviction-history`).then((r) => r.json()),
    ]).then(([nextProposal, nextHistory]) => {
      setProposal(nextProposal as Record<string, unknown>);
      setHistory(((nextHistory as { data?: Record<string, unknown>[] }).data ?? []).map((row) => ({ ledger: Number(row.ledger), conviction: BigInt(String(row.conviction)) })));
    });
  };

  useEffect(() => {
    fetchData();
  }, [id, indexerUrl]);

  const points = useMemo(() => {
    if (history.length === 0) return "";
    const max = history.reduce((value, point) => point.conviction > value ? point.conviction : value, 1n);
    return history.map((point, index) => `${(index / Math.max(1, history.length - 1)) * 100},${100 - Number(point.conviction * 100n / max)}`).join(" ");
  }, [history]);

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !publicKey) return;
    setIsSubmitting(true);
    try {
      await client.stakeWithSign(publicKey, Number(id), BigInt(stakeAmount), signTransaction);
      setStakeAmount("");
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdrawStake = async () => {
    if (!client || !publicKey) return;
    setIsSubmitting(true);
    try {
      await client.withdrawStakeWithSign(publicKey, signTransaction);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckpoint = async () => {
    if (!client || !publicKey) return;
    setIsSubmitting(true);
    try {
      await client.checkpointConvictionWithSign(publicKey, Number(id), signTransaction);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!proposal) return <main className="mx-auto max-w-5xl px-4 py-10">Loading proposal…</main>;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Conviction proposal #{id}</h1>
        {isConnected && (
          <button onClick={handleCheckpoint} disabled={isSubmitting} className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">
            Checkpoint
          </button>
        )}
      </div>
      <dl className="mt-6 grid gap-3 rounded-xl border p-5"><div><dt className="text-sm text-slate-500">Target</dt><dd className="break-all">{String(proposal.target)}</dd></div><div><dt className="text-sm text-slate-500">Requested</dt><dd>{String(proposal.requested_amount)}</dd></div><div><dt className="text-sm text-slate-500">Conviction</dt><dd>{String(proposal.conviction)}</dd></div></dl>
      
      {isConnected && (
        <section className="mt-8 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Stake</h2>
          <form onSubmit={handleStake} className="mt-4 flex gap-4">
            <input
              type="number"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="Amount to stake"
              className="flex-1 rounded border px-3 py-2"
              disabled={isSubmitting}
            />
            <button type="submit" disabled={isSubmitting || !stakeAmount} className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">
              Stake
            </button>
            <button type="button" onClick={handleWithdrawStake} disabled={isSubmitting} className="rounded border px-4 py-2 text-indigo-600 disabled:opacity-50">
              Withdraw Stake
            </button>
          </form>
        </section>
      )}

      <section className="mt-8"><h2 className="text-xl font-semibold">Conviction growth</h2><svg viewBox="0 0 100 100" className="mt-4 h-64 w-full rounded-xl border p-4" role="img" aria-label="Conviction growth over time"><line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" strokeDasharray="3 2" opacity="0.45" /><polyline points={points} fill="none" stroke="rgb(79 70 229)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg><p className="mt-2 text-sm text-slate-500">Dashed line represents the required threshold; the trend extends as new checkpoints arrive.</p></section>
    </main>
  );
}

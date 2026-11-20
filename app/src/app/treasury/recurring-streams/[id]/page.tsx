"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StrKey } from "@stellar/stellar-sdk";
import { useWallet } from "../../../../lib/wallet-context";
import { TreasuryClient } from "../../../../lib/treasury-client";

type Stream = Awaited<ReturnType<TreasuryClient["getRecurringStream"]>>;
type StellarNetwork = "mainnet" | "testnet" | "futurenet";

export default function RecurringStreamDetailPage() {
  const { id } = useParams();
  const { publicKey, signTransaction } = useWallet();
  const [stream, setStream] = useState<Stream | null>(null);
  const [claimable, setClaimable] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const address = process.env.NEXT_PUBLIC_TREASURY_STREAMS_ADDRESS ?? "";
  const streamId = typeof id === "string" && /^\d+$/.test(id) ? BigInt(id) : null;

  const load = useCallback(async () => {
    if (!publicKey || !StrKey.isValidContract(address) || streamId === null) return;
    try {
      const client = new TreasuryClient({
        network: (process.env.NEXT_PUBLIC_NETWORK as StellarNetwork) ?? "testnet",
        treasuryAddress: address,
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
      });
      const [nextStream, nextClaimable] = await Promise.all([
        client.getRecurringStream(address, publicKey, streamId),
        client.getRecurringClaimable(address, publicKey, streamId),
      ]);
      setStream(nextStream);
      setClaimable(nextClaimable);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [address, publicKey, streamId]);

  useEffect(() => { void load(); }, [load]);

  async function cancel() {
    if (!publicKey || streamId === null || !stream) return;
    setBusy(true);
    setError(null);
    try {
      const client = new TreasuryClient({
        network: (process.env.NEXT_PUBLIC_NETWORK as StellarNetwork) ?? "testnet",
        treasuryAddress: address,
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
      });
      await client.cancelRecurringStream(address, publicKey, streamId, signTransaction);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-xl mx-auto p-4 space-y-4">
      <Link href="/treasury/streams" className="text-indigo-600">← Treasury streams</Link>
      <h1 className="text-xl font-bold">Recurring stream #{id}</h1>
      {!publicKey && <p>Connect your wallet to view this stream.</p>}
      {!StrKey.isValidContract(address) && <p role="alert">Configure NEXT_PUBLIC_TREASURY_STREAMS_ADDRESS to view recurring streams.</p>}
      {streamId === null && <p role="alert">Invalid stream ID.</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {stream && <>
        <dl className="space-y-2">
          <div><dt className="font-medium">Recipient</dt><dd className="break-all">{stream.recipient}</dd></div>
          <div><dt className="font-medium">Asset</dt><dd className="break-all">{stream.asset}</dd></div>
          <div><dt className="font-medium">Amount per interval</dt><dd>{stream.amountPerInterval.toString()} raw units</dd></div>
          <div><dt className="font-medium">Paid so far</dt><dd>{stream.totalStreamed.toString()} raw units</dd></div>
          <div><dt className="font-medium">Due now, settled on cancel</dt><dd>{claimable?.toString() ?? "—"} raw units</dd></div>
          <div><dt className="font-medium">Status</dt><dd>{stream.cancelled ? "Cancelled" : stream.paused ? "Paused" : "Active"}</dd></div>
        </dl>
        {!stream.cancelled && publicKey && <button type="button" disabled={busy} onClick={cancel}
          className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">
          {busy ? "Cancelling…" : "Cancel and settle accrued intervals"}
        </button>}
      </>}
    </main>
  );
}

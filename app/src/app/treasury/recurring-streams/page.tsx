"use client";

import { useState } from "react";
import Link from "next/link";
import { StrKey } from "@stellar/stellar-sdk";
import { useWallet } from "../../../lib/wallet-context";
import { TreasuryClient } from "../../../lib/treasury-client";
import { isValidStellarAddress } from "../../../lib/utils/stellarAddress";
import { validateRecurringSchedule } from "../../../lib/recurring-stream-validation";

type StellarNetwork = "mainnet" | "testnet" | "futurenet";

export default function RecurringStreamsPage() {
  const { publicKey, signTransaction } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [asset, setAsset] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const streamsAddress = process.env.NEXT_PUBLIC_TREASURY_STREAMS_ADDRESS ?? "";

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!publicKey || !streamsAddress) return;
    const scheduleError = validateRecurringSchedule(start, end, interval);
    if (scheduleError) return setError(scheduleError);
    if (!(isValidStellarAddress(recipient) || StrKey.isValidContract(recipient)) || !StrKey.isValidContract(asset)) {
      return setError("Enter valid Stellar recipient and asset addresses");
    }
    if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n || BigInt(amount) > (1n << 127n) - 1n) {
      return setError("Amount per interval must be a positive integer in raw asset units");
    }
    setError(null);
    setBusy(true);
    try {
      const client = new TreasuryClient({
        network: (process.env.NEXT_PUBLIC_NETWORK as StellarNetwork) ?? "testnet",
        treasuryAddress: streamsAddress,
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
      });
      const id = await client.createRecurringStream(
        streamsAddress, publicKey, recipient, asset, BigInt(amount),
        Number(interval), Number(start), Number(end), signTransaction,
      );
      setCreatedId(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-xl mx-auto p-4">
      <Link href="/treasury/streams" className="text-sm text-indigo-600">← Budget streams</Link>
      <h1 className="text-xl font-bold mt-3">Create recurring payment stream</h1>
      <p className="text-sm text-gray-600 mt-2">The connected wallet must be the treasury-streams governor. Amounts use raw asset units.</p>
      {!StrKey.isValidContract(streamsAddress) ? (
        <p role="alert" className="text-red-700 mt-4">Set NEXT_PUBLIC_TREASURY_STREAMS_ADDRESS to enable recurring streams.</p>
      ) : !publicKey ? (
        <p className="mt-4">Connect your wallet to create a stream.</p>
      ) : (
        <form onSubmit={create} className="space-y-3 mt-5">
          {([
            ["Recipient address", recipient, setRecipient],
            ["Asset contract address", asset, setAsset],
            ["Amount per interval (raw units)", amount, setAmount],
            ["Interval (ledgers)", interval, setInterval],
            ["Start ledger", start, setStart],
            ["End ledger", end, setEnd],
          ] as const).map(([label, value, setter]) => (
            <label key={label} className="block text-sm font-medium">
              {label}
              <input required value={value} onChange={(event) => setter(event.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 p-2" />
            </label>
          ))}
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {createdId !== null && <p role="status" className="text-green-700">Created stream #{createdId.toString()}. <Link href={`/treasury/recurring-streams/${createdId.toString()}`} className="underline">View stream</Link></p>}
          <button type="submit" disabled={busy} className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create recurring stream"}
          </button>
        </form>
      )}
    </main>
  );
}

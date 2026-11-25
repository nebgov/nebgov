"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import type { TreasuryClient, TreasuryBudgetStream } from "../lib/treasury-client";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface TopUpStreamModalProps {
  client: TreasuryClient;
  stream: TreasuryBudgetStream;
  signerPublicKey: string;
  signUnsignedXdr: (xdr: string) => Promise<string>;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
  onToppedUp: () => void;
}

export function TopUpStreamModal({
  client,
  stream,
  signerPublicKey,
  signUnsignedXdr,
  busy,
  setBusy,
  onClose,
  onToppedUp,
}: TopUpStreamModalProps) {
  const t = useTranslations("topUpStreamModal");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: bigint;
    try {
      parsed = BigInt(amount);
    } catch {
      setError(t("enterValidWholeNumber"));
      return;
    }
    if (parsed <= 0n) {
      setError(t("amountGreaterThanZero"));
      return;
    }

    setBusy(true);
    try {
      await client.topUpStream(signerPublicKey, Number(stream.id), parsed, signUnsignedXdr);
      toast.success(t("streamToppedUp"));
      onToppedUp();
      onClose();
    } catch (err) {
      toast.error(`${t("topUpFailed")}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topup-stream-modal-title"
      tabIndex={-1}
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex items-start justify-between mb-1">
          <h2 id="topup-stream-modal-title" className="text-lg font-semibold">
            {t("title")}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label={t("close")}
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{stream.name} — {t("additionalAllocation")}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">{t("amount")}</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(""); }}
              placeholder="1000"
              className={`w-full border rounded-md px-3 py-2 text-sm ${
                error ? "border-red-400" : "border-gray-300"
              }`}
              required
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 rounded-md py-2 text-sm hover:bg-gray-50"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={busy || !!error}
              className="flex-1 bg-indigo-600 text-white rounded-md py-2 text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? t("toppingUp") : t("topUpStream")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

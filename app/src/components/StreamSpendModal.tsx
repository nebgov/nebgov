"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import type { TreasuryClient, TreasuryBudgetStream } from "../lib/treasury-client";
import { isValidStellarAddress } from "../lib/utils/stellarAddress";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface StreamSpendModalProps {
  client: TreasuryClient;
  stream: TreasuryBudgetStream;
  signerPublicKey: string;
  signUnsignedXdr: (xdr: string) => Promise<string>;
  onClose: () => void;
  onSpent: () => void;
}

export function StreamSpendModal({
  client,
  stream,
  signerPublicKey,
  signUnsignedXdr,
  onClose,
  onSpent,
}: StreamSpendModalProps) {
  const t = useTranslations("streamSpendModal");
  const [recipient, setRecipient] = useState("");
  const [recipientError, setRecipientError] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const remaining = stream.totalAllocated - stream.totalSpent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !amount) {
      toast.error(t("fillRecipientAndAmount"));
      return;
    }
    if (!isValidStellarAddress(recipient)) {
      setRecipientError(t("invalidStellarAddress"));
      return;
    }

    let amt: bigint;
    try {
      amt = BigInt(amount);
    } catch {
      toast.error(t("enterWholeNumberAmount"));
      return;
    }
    if (amt > remaining) {
      toast.error(t("amountExceedsRemaining"));
      return;
    }
    if (amt > stream.maxSingleSpend) {
      toast.error(t("amountExceedsMaxSingleSpend", { max: stream.maxSingleSpend.toString() }));
      return;
    }

    setSubmitting(true);
    try {
      await client.streamSpend(
        signerPublicKey,
        Number(stream.id),
        recipient,
        amt,
        memo,
        signUnsignedXdr,
      );
      toast.success(t("spendExecutedSuccessfully"));
      onSpent();
      onClose();
    } catch (err) {
      toast.error(`${t("spendFailed")}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stream-spend-modal-title"
      tabIndex={-1}
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex items-start justify-between mb-1">
          <h2 id="stream-spend-modal-title" className="text-lg font-semibold">
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
        <p className="text-xs text-gray-500 mb-4">
          {stream.name} — {t("remaining", { amount: remaining.toString(), max: stream.maxSingleSpend.toString() })}
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">{t("recipientAddress")}</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => { setRecipient(e.target.value); setRecipientError(""); }}
              onBlur={(e) => {
                if (e.target.value && !isValidStellarAddress(e.target.value))
                  setRecipientError(t("invalidStellarAddress"));
                else setRecipientError("");
              }}
              placeholder="G..."
              className={`w-full border rounded-md px-3 py-2 text-sm font-mono ${
                recipientError ? "border-red-400" : "border-gray-300"
              }`}
              required
            />
            {recipientError && <p className="text-xs text-red-500 mt-1">{recipientError}</p>}
          </div>
          <div>
            <label className="text-xs text-gray-500">{t("amount")}</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">{t("memoOptional")}</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t("memoPlaceholder")}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
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
              disabled={submitting || !stream.isActive || !!recipientError}
              className="flex-1 bg-indigo-600 text-white rounded-md py-2 text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? t("spending") : t("executeSpend")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

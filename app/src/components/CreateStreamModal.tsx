"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import type { TreasuryClient } from "../lib/treasury-client";
import { isValidStellarAddress } from "../lib/utils/stellarAddress";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface CreateStreamModalProps {
  client: TreasuryClient;
  signerPublicKey: string;
  tokenAddress: string;
  signUnsignedXdr: (xdr: string) => Promise<string>;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateStreamModal({
  client,
  signerPublicKey,
  tokenAddress,
  signUnsignedXdr,
  onClose,
  onCreated,
}: CreateStreamModalProps) {
  const t = useTranslations("createStreamModal");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [ownerError, setOwnerError] = useState("");
  const [totalAllocated, setTotalAllocated] = useState("");
  const [maxSingleSpend, setMaxSingleSpend] = useState("");
  const [startLedger, setStartLedger] = useState("");
  const [endLedger, setEndLedger] = useState("");
  const [cooldownLedgers, setCooldownLedgers] = useState("0");
  const [proposalId, setProposalId] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !owner || !totalAllocated || !maxSingleSpend || !startLedger || !endLedger) {
      toast.error(t("fillAllRequiredFields"));
      return;
    }
    if (!isValidStellarAddress(owner)) {
      setOwnerError(t("invalidStellarAddress"));
      return;
    }

    setSubmitting(true);
    try {
      await client.createStream(
        signerPublicKey,
        name,
        owner,
        tokenAddress,
        BigInt(totalAllocated),
        Number(startLedger),
        Number(endLedger),
        BigInt(maxSingleSpend),
        Number(cooldownLedgers),
        BigInt(proposalId),
        signUnsignedXdr,
      );
      toast.success(t("streamCreatedSuccessfully"));
      onCreated();
      onClose();
    } catch (err) {
      toast.error(`${t("failedToCreateStream")}: ${err instanceof Error ? err.message : String(err)}`);
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
      aria-labelledby="create-stream-modal-title"
      tabIndex={-1}
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h2 id="create-stream-modal-title" className="text-lg font-semibold">
            {t("title")}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label={t("closeLabel")}
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">{t("streamNameLabel")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("streamNamePlaceholder")}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">{t("ownerAddressLabel")}</label>
            <input
              type="text"
              value={owner}
              onChange={(e) => { setOwner(e.target.value); setOwnerError(""); }}
              onBlur={(e) => {
                if (e.target.value && !isValidStellarAddress(e.target.value))
                  setOwnerError(t("invalidStellarAddress"));
                else setOwnerError("");
              }}
              placeholder={t("ownerAddressPlaceholder")}
              className={`w-full border rounded-md px-3 py-2 text-sm font-mono ${
                ownerError ? "border-red-400" : "border-gray-300"
              }`}
              required
            />
            {ownerError && <p className="text-xs text-red-500 mt-1">{ownerError}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">{t("totalAllocatedLabel")}</label>
              <input
                type="text"
                value={totalAllocated}
                onChange={(e) => setTotalAllocated(e.target.value)}
                placeholder={t("totalAllocatedPlaceholder")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t("maxSingleSpendLabel")}</label>
              <input
                type="text"
                value={maxSingleSpend}
                onChange={(e) => setMaxSingleSpend(e.target.value)}
                placeholder={t("maxSingleSpendPlaceholder")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">{t("startLedgerLabel")}</label>
              <input
                type="number"
                value={startLedger}
                onChange={(e) => setStartLedger(e.target.value)}
                placeholder={t("startLedgerPlaceholder")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t("endLedgerLabel")}</label>
              <input
                type="number"
                value={endLedger}
                onChange={(e) => setEndLedger(e.target.value)}
                placeholder={t("endLedgerPlaceholder")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">{t("cooldownLabel")}</label>
              <input
                type="number"
                value={cooldownLedgers}
                onChange={(e) => setCooldownLedgers(e.target.value)}
                placeholder={t("cooldownPlaceholder")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t("proposalIdLabel")}</label>
              <input
                type="number"
                value={proposalId}
                onChange={(e) => setProposalId(e.target.value)}
                placeholder={t("proposalIdPlaceholder")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 rounded-md py-2 text-sm hover:bg-gray-50"
            >
              {t("cancelButton")}
            </button>
            <button
              type="submit"
              disabled={submitting || !!ownerError}
              className="flex-1 bg-indigo-600 text-white rounded-md py-2 text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? t("creatingButton") : t("createButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

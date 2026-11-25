"use client";

/**
 * Delegation modal - lets users delegate or revoke delegation.
 */

import { useEffect, useState, type FormEvent } from "react";
import { isValidStellarAddress } from "../lib/utils/stellarAddress";
import toast from "react-hot-toast";
import { VotesClient, type Network } from "@nebgov/sdk";
import { useWallet } from "../lib/wallet-context";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useTranslations } from "next-intl";

interface Props {
  open: boolean;
  onClose: () => void;
  onDelegated?: () => void;
  prefillAddress?: string;
  currentDelegatee?: string | null;
  /** Shown as a secondary "delegate without paying gas" action, if provided. */
  onOpenGasless?: () => void;
  /** Shown as a secondary "split my delegation instead" action, if provided. */
  onOpenSplit?: () => void;
}

function getVotesClientFromEnv(): VotesClient {
  const governorAddress = process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;
  const timelockAddress = process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS;
  const votesAddress = process.env.NEXT_PUBLIC_VOTES_ADDRESS;
  const network = (process.env.NEXT_PUBLIC_NETWORK || "testnet") as Network;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

  if (!governorAddress || !timelockAddress || !votesAddress) {
    throw new Error("Missing NEXT_PUBLIC_* contract addresses in .env.local");
  }

  return new VotesClient({
    governorAddress,
    timelockAddress,
    votesAddress,
    network,
    ...(rpcUrl && { rpcUrl }),
  });
}

function explorerTxUrl(txHash: string): string {
  const network = process.env.NEXT_PUBLIC_NETWORK || "testnet";
  const base =
    network === "mainnet"
      ? "https://stellar.expert/explorer/public"
      : "https://stellar.expert/explorer/testnet";
  return `${base}/tx/${txHash}`;
}

export function DelegateModal({
  open,
  onClose,
  onDelegated,
  prefillAddress,
  currentDelegatee,
  onOpenGasless,
  onOpenSplit,
}: Props) {
  const [delegatee, setDelegatee] = useState(prefillAddress || "");
  const [delegateeError, setDelegateeError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { isConnected, publicKey, signTransaction } = useWallet();
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onClose);
  const t = useTranslations("delegation");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  useEffect(() => {
    setDelegatee(prefillAddress ?? "");
  }, [open, prefillAddress]);

  if (!open) return null;

  const isDelegatingAway =
    Boolean(currentDelegatee) &&
    Boolean(publicKey) &&
    currentDelegatee !== publicKey;

  function validateDelegatee(value: string) {
    if (!value.trim()) {
      setDelegateeError(t("addressRequired"));
      return false;
    }
    if (!isValidStellarAddress(value)) {
      setDelegateeError(tErrors("invalidStellarAddress"));
      return false;
    }
    setDelegateeError("");
    return true;
  }

  async function handleDelegate(e: FormEvent) {
    e.preventDefault();
    if (!validateDelegatee(delegatee)) return;

    setSubmitting(true);
    try {
      if (!isConnected || !publicKey) {
        throw new Error(tErrors("connectWalletFirst"));
      }

      const client = getVotesClientFromEnv();
      const txHash = await client.delegateWithSign(publicKey, delegatee.trim(), signTransaction);
      toast.success(
        <div>
          {t("delegationSubmitted")}{" "}
          <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="underline">
            {t("viewOnExplorer")}
          </a>
        </div>,
        { duration: 8000 },
      );
      onDelegated?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`${t("delegationFailed")}: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUndelegate() {
    if (!isConnected || !publicKey) {
      toast.error(tErrors("connectWalletFirst"));
      return;
    }

    setSubmitting(true);
    try {
      const client = getVotesClientFromEnv();
      const txHash = await client.undelegateWithSign(publicKey, signTransaction);
      toast.success(
        <div>
          {t("undelegationSubmitted")}{" "}
          <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="underline">
            {t("viewOnExplorer")}
          </a>
        </div>,
        { duration: 8000 },
      );
      onDelegated?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`${t("undelegationFailed")}: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delegate-modal-title"
      tabIndex={-1}
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-start justify-between mb-1">
          <h2 id="delegate-modal-title" className="text-lg font-bold text-gray-900">
            {t("title")}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label={tCommon("close")}
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {t("description")}
        </p>

        {isDelegatingAway && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {t("currentlyDelegatingTo")}{" "}
            <span className="font-mono">{currentDelegatee}</span>. {t("useUndelegation")}
          </div>
        )}

        <form onSubmit={handleDelegate} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500 font-mono">
              {publicKey
                ? `${t("you")}: ${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
                : t("notConnected")}
            </span>
            <button
              type="button"
              disabled={!publicKey}
              onClick={() => publicKey && setDelegatee(publicKey)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t("delegateToMyself")}
            </button>
          </div>

          <input
            type="text"
            placeholder={t("addressPlaceholder")}
            value={delegatee}
            onChange={(e) => { setDelegatee(e.target.value); setDelegateeError(""); }}
            onBlur={(e) => validateDelegatee(e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono ${
              delegateeError ? "border-red-400" : "border-gray-300"
            }`}
            required
          />
          {delegateeError && (
            <p className="text-xs text-red-500 mt-1">{delegateeError}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !!delegateeError || !delegatee.trim()}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? t("delegating") : t("delegateButton")}
            </button>
          </div>

          {isDelegatingAway && (
            <button
              type="button"
              onClick={() => void handleUndelegate()}
              disabled={submitting}
              className="w-full rounded-lg border border-amber-200 bg-amber-50 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {submitting ? t("updating") : t("undelegateButton")}
            </button>
          )}

          {onOpenGasless && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-xs text-gray-500 mb-2">
                {t("orDelegateWithoutGas")}
              </p>
              <button
                type="button"
                onClick={onOpenGasless}
                disabled={submitting}
                className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {t("delegateFree")}
              </button>
              <p className="text-xs text-gray-400 mt-1">
                {t("signOffChain")}
              </p>
            </div>
          )}

          {onOpenSplit && (
            <div className={onOpenGasless ? "pt-2" : "border-t border-gray-200 pt-4 mt-4"}>
              <button
                type="button"
                onClick={onOpenSplit}
                disabled={submitting}
                className="w-full text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
              >
                {t("splitDelegation")}
              </button>
              <p className="text-xs text-gray-400 mt-1 text-center">
                {t("splitDescription")}
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { GovernorClient, VoteSupport, VoteType, computeQuadraticWeight, type Network } from "@nebgov/sdk";
import { useWallet } from "../lib/wallet-context";
import { useGovernorConfig } from "@/hooks/useGovernorConfig";
import { useTranslations, useFormatter } from "next-intl";

interface Props {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  proposalId: bigint | string;
  preselectedSupport?: VoteSupport | null;
  delegatee?: string | null;
  votingPower?: bigint;
  onOpenDelegate?: () => void;
  onVoted?: () => void;
  onSuccess?: () => void;
  voteType?: VoteType;
  governorClient?: GovernorClient | null;
  proposalTitle?: string;
}

function getGovernorClientFromEnv(): GovernorClient {
  const governorAddress = process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;
  const timelockAddress = process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS;
  const votesAddress = process.env.NEXT_PUBLIC_VOTES_ADDRESS;
  const network = (process.env.NEXT_PUBLIC_NETWORK || "testnet") as Network;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

  if (!governorAddress || !timelockAddress || !votesAddress) {
    throw new Error("Missing NEXT_PUBLIC_* contract addresses in .env.local");
  }

  return new GovernorClient({
    governorAddress,
    timelockAddress,
    votesAddress,
    network,
    ...(rpcUrl && { rpcUrl }),
  });
}

export function VotingModal({
  open,
  isOpen,
  onClose,
  proposalId,
  preselectedSupport,
  delegatee,
  votingPower,
  onOpenDelegate,
  onVoted,
  onSuccess,
  voteType,
  governorClient,
}: Props) {
  const { isConnected, connect, publicKey, signTransaction } = useWallet();
  const { divisor } = useGovernorConfig();
  const t = useTranslations("voting");
  const tProposal = useTranslations("proposal");
  const tForms = useTranslations("forms");
  const tActions = useTranslations("actions");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  
  const resolvedOpen = open ?? isOpen ?? false;
  const resolvedProposalId = typeof proposalId === "bigint" ? proposalId : BigInt(proposalId);
  const resolvedDelegatee = delegatee ?? publicKey ?? null;
  const resolvedVotingPower = votingPower ?? 0n;
  const [support, setSupport] = useState<VoteSupport | null>(preselectedSupport ?? null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [estimatingFee, setEstimatingFee] = useState(false);
  const [estimatedFeeStroops, setEstimatedFeeStroops] = useState<bigint | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  useEffect(() => setSupport(preselectedSupport ?? null), [preselectedSupport]);

  useEffect(() => {
    if (!resolvedOpen || support === null || !resolvedDelegatee) {
      setEstimatingFee(false);
      setEstimatedFeeStroops(null);
      setEstimateError(null);
      return;
    }

    let cancelled = false;

    async function loadEstimate() {
      setEstimatingFee(true);
      try {
        const client = governorClient ?? getGovernorClientFromEnv();
        const result = await client.estimateVoteGas(
          resolvedDelegatee,
          resolvedProposalId,
          support,
        );

        if (cancelled) return;
        if (result.ok) {
          setEstimatedFeeStroops(
            result.estimatedFeeStroops ? BigInt(result.estimatedFeeStroops) : null,
          );
          setEstimateError(null);
        } else {
          setEstimatedFeeStroops(null);
          setEstimateError(result.error ?? "Unable to estimate fee");
        }
      } catch (err) {
        if (cancelled) return;
        setEstimatedFeeStroops(null);
        setEstimateError(err instanceof Error ? err.message : "Unable to estimate fee");
      } finally {
        if (!cancelled) {
          setEstimatingFee(false);
        }
      }
    }

    void loadEstimate();

    return () => {
      cancelled = true;
    };
  }, [governorClient, resolvedDelegatee, resolvedOpen, resolvedProposalId, support]);

  // Focus management for modal
  useEffect(() => {
    if (resolvedOpen) {
      // Focus the modal when it opens
      const modal = document.getElementById('voting-modal');
      if (modal) {
        modal.focus();
      }
    }
  }, [resolvedOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && resolvedOpen) {
        onClose();
      }
    };
    
    if (resolvedOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [resolvedOpen, onClose]);

  if (!resolvedOpen) return null;

  const tokenAmount = Number(resolvedVotingPower) / 1e6;
  const isQuadratic = voteType === VoteType.Quadratic;
  const quadraticWeight = isQuadratic ? computeQuadraticWeight(resolvedVotingPower) : null;

  const totalSupplyRaw = process.env.NEXT_PUBLIC_TOTAL_SUPPLY; // optional, in tokens (raw units)
  const percentOfSupply = (() => {
    try {
      if (!totalSupplyRaw) return null;
      const total = BigInt(totalSupplyRaw);
      if (total === 0n) return null;
      return Number((resolvedVotingPower * 10000n) / total) / 100; // two decimals
    } catch {
      return null;
    }
  })();
  const estimatedFeeXlm =
    estimatedFeeStroops !== null ? Number(estimatedFeeStroops) / divisor : null;

  async function handleConfirm() {
    if (support === null) {
      toast.error(t("selectOptionFirst"));
      return;
    }

    if (!isConnected || !publicKey) {
      try {
        await connect();
      } catch (e) {
        toast.error(t("connectToContinue"));
        return;
      }
    }

    if (!resolvedDelegatee) {
      toast.error(t("delegateFirst"));
      return;
    }

    setSubmitting(true);
    try {
      const client = getGovernorClientFromEnv();
      if (!signTransaction) {
        throw new Error(t("connectToSign"));
      }
      await client.castVoteWithSign(
        publicKey,
        resolvedProposalId,
        support,
        signTransaction,
      );
      toast.success(
        t("voteSubmitted"),
        { duration: 8000 },
      );
      onVoted?.();
      onSuccess?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errStr = msg.toLowerCase();
      
      let errorMessage = t("voteFailed", { error: msg });
      if (errStr.includes("proposalnotactive") || 
          errStr.includes("proposal not active") ||
          errStr.includes("error(contract, #28)")) {
        errorMessage = t("votingEnded");
      }
      
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voting-modal-title"
      aria-describedby="voting-modal-description"
    >
      <div 
        id="voting-modal"
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-xl"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 id="voting-modal-title" className="text-lg font-bold text-gray-900 dark:text-gray-100">{t("castYourVote")}</h2>
            <p id="voting-modal-description" className="text-sm text-gray-500 dark:text-gray-300">{t("subtitle")}</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 p-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label={t("closeModal")}
          >
            ✕
          </button>
        </div>

        {/* Delegation check */}
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg p-3 mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">{tForms("delegation")}</p>
          {resolvedDelegatee ? (
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">{tForms("delegatedTo")} <span className="font-mono">{resolvedDelegatee}</span></p>
          ) : (
            <div className="mt-2 flex items-center gap-3">
              <p className="text-sm text-red-600">{t("notDelegated")}</p>
              <button
                onClick={onOpenDelegate}
                className="ml-auto text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label={t("openDelegateModal")}
              >
                {tActions("delegateNow")}
              </button>
            </div>
          )}
        </div>

        {/* Voting power */}
        <div className="mb-4">
          <p className="text-sm text-gray-500">{tForms("yourVotingPower")}</p>
          {isQuadratic ? (
            <div>
              <p className="text-base font-medium text-gray-900 dark:text-gray-100">
                {format.number(tokenAmount, { maximumFractionDigits: 6 })} {t("tokens")}
                {percentOfSupply !== null ? (
                  <span className="text-sm text-gray-500"> ({format.number(percentOfSupply)}%)</span>
                ) : null}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                  {t("voteWeightQuadratic", { weight: format.number(quadraticWeight!) })}
                </p>
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-[10px] cursor-help focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title={t("quadraticExplanation")}
                  aria-label={t("quadraticExplanation")}
                  tabIndex={0}
                >
                  ?
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {t("quadraticFormula", { balance: format.number(tokenAmount, { maximumFractionDigits: 6 }), weight: format.number(quadraticWeight!) })}
              </p>
            </div>
          ) : (
            <p className="text-base font-medium text-gray-900 dark:text-gray-100">
              {format.number(tokenAmount, { maximumFractionDigits: 6 })} {t("tokens")}
              {percentOfSupply !== null ? (
                <span className="text-sm text-gray-500"> ({format.number(percentOfSupply)}%)</span>
              ) : null}
            </p>
          )}
        </div>

        <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("estimatedFee")}
          </p>
          <p className="mt-1 text-sm text-gray-800">
            {estimatingFee
              ? t("estimating")
              : estimatedFeeXlm !== null
                ? `~${format.number(estimatedFeeXlm, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} XLM`
                : estimateError ?? t("feeUnavailable")}
          </p>
        </div>

        {/* Vote options */}
        <fieldset className="mb-4">
          <legend className="sr-only">{t("voteOptions")}</legend>
          <div className="flex gap-3" role="radiogroup" aria-label={t("voteOptions")}>
            {[
              { label: tProposal("for"), value: VoteSupport.For, color: "border-green-500 text-green-700 bg-green-50", ariaLabel: t("voteFor") },
              { label: tProposal("against"), value: VoteSupport.Against, color: "border-red-500 text-red-700 bg-red-50", ariaLabel: t("voteAgainst") },
              { label: tProposal("abstain"), value: VoteSupport.Abstain, color: "border-gray-400 text-gray-600 bg-gray-50", ariaLabel: t("voteAbstain") },
            ].map(({ label, value, color, ariaLabel }) => (
              <button
                key={label}
                onClick={() => setSupport(value)}
                className={`flex-1 border-2 rounded-lg py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  support === value ? color : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
                role="radio"
                aria-checked={support === value}
                aria-label={ariaLabel}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label htmlFor="vote-reason" className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
          {t("optionalReasonLabel")} <span className="text-xs text-gray-400">{t("optionalReasonMax")}</span>
        </label>
        <textarea
          id="vote-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 256))}
          placeholder={t("reasonPlaceholder")}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          rows={4}
          aria-describedby="reason-help"
        />
        <div id="reason-help" className="sr-only">
          {t("reasonHelpText")}
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleConfirm}
              disabled={submitting || !isConnected || !resolvedDelegatee}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            aria-describedby={!resolvedDelegatee ? "delegation-required" : undefined}
          >
            {submitting ? t("submittingVote") : t("confirmSign")}
          </button>
          <button 
            onClick={onClose} 
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {tCommon("cancel")}
          </button>
        </div>
        
        {!resolvedDelegatee && (
          <div id="delegation-required" className="sr-only">
            {t("mustDelegate")}
          </div>
        )}
      </div>
    </div>
  );
}

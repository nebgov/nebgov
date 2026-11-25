"use client";

/**
 * Optimistic-governance proposal detail (Issue #993).
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { OptimisticGovernorClient, VotesClient, subscribeToOptimisticObjectionCast } from "@nebgov/sdk";
import { useWallet } from "../../../lib/wallet-context";
import { readGovernorConfig, subscriptionOptsFromConfig } from "../../../lib/nebgov-env";
import { useOptimisticProposal } from "../../../hooks/useOptimisticProposals";
import { ChallengeCountdown } from "../../../components/ChallengeCountdown";
import { useLedgerClock } from "../../../lib/hooks/useLedgerClock";
import { useTranslations } from "next-intl";

function formatAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function OptimisticProposalPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { publicKey, signTransaction } = useWallet();
  const { proposal, objections, loading, error, refresh } = useOptimisticProposal(id);
  const { currentLedger } = useLedgerClock();
  const [votingPower, setVotingPower] = useState<bigint | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionType, setActionType] = useState<"object" | "finalize" | "execute" | null>(null);
  const t = useTranslations("optimistic");
  const tActions = useTranslations("actions");

  const STATE_LABELS: Record<string, string> = {
    challenge_window: t("stateChallengeWindow"),
    passed: t("statePassed"),
    frozen: t("stateFrozen"),
    executed: t("stateExecuted"),
    cancelled: t("stateCancelled"),
  };

  const hasObjected = !!publicKey && objections.some((o) => o.objector === publicKey);
  const challengeElapsed = !!proposal && currentLedger >= proposal.challengeEndLedger;

  useEffect(() => {
    if (!publicKey || !proposal) {
      setVotingPower(null);
      return;
    }
    const config = readGovernorConfig();
    if (!config) return;
    void (async () => {
      try {
        const votes = new VotesClient(config);
        const power = await votes.getPastVotes(publicKey, proposal.createdLedger);
        setVotingPower(power);
      } catch {
        setVotingPower(null);
      }
    })();
  }, [publicKey, proposal]);

  useEffect(() => {
    if (!id) return;
    const config = readGovernorConfig();
    if (!config?.optimisticGovernorAddress) return;
    return subscribeToOptimisticObjectionCast(
      config.optimisticGovernorAddress,
      (event) => {
        if (event.proposalId === BigInt(id)) refresh();
      },
      subscriptionOptsFromConfig(config),
    );
  }, [id, refresh]);

  async function handleObject() {
    if (!publicKey || !signTransaction || !proposal) return;
    const config = readGovernorConfig();
    if (!config || !config.optimisticGovernorAddress) {
      toast.error("Optimistic governance is not configured.");
      return;
    }
    setSubmitting(true);
    setActionType("object");
    try {
      const client = new OptimisticGovernorClient(config);
      await client.objectWithSign(publicKey, Number(proposal.proposalId), signTransaction);
      toast.success("Objection submitted.");
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Objection failed");
    } finally {
      setSubmitting(false);
      setActionType(null);
    }
  }

  async function handleFinalize() {
    if (!publicKey || !signTransaction || !proposal) return;
    const config = readGovernorConfig();
    if (!config || !config.optimisticGovernorAddress) {
      toast.error("Optimistic governance is not configured.");
      return;
    }
    setSubmitting(true);
    setActionType("finalize");
    try {
      const client = new OptimisticGovernorClient(config);
      await client.finalizeWithSign(publicKey, Number(proposal.proposalId), signTransaction);
      toast.success("Proposal finalized.");
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Finalize failed");
    } finally {
      setSubmitting(false);
      setActionType(null);
    }
  }

  async function handleExecute() {
    if (!publicKey || !signTransaction || !proposal) return;
    const config = readGovernorConfig();
    if (!config || !config.optimisticGovernorAddress) {
      toast.error("Optimistic governance is not configured.");
      return;
    }
    setSubmitting(true);
    setActionType("execute");
    try {
      const client = new OptimisticGovernorClient(config);
      await client.executeWithSign(publicKey, Number(proposal.proposalId), signTransaction);
      toast.success("Proposal executed.");
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Execute failed");
    } finally {
      setSubmitting(false);
      setActionType(null);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-5xl px-4 py-10">{t("title").replace("#{id}", "…")}</main>;
  }
  if (!proposal) {
    return <main className="mx-auto max-w-5xl px-4 py-10">{t("noProposals")}</main>;
  }

  const canObject =
    !!publicKey &&
    proposal.state === "challenge_window" &&
    !challengeElapsed &&
    !hasObjected &&
    votingPower !== null &&
    votingPower > 0n;

  const canFinalize =
    !!publicKey &&
    proposal.state === "challenge_window" &&
    challengeElapsed;

  const canExecute =
    !!publicKey &&
    proposal.state === "passed";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{t("proposalTitle", { id })}</h1>
        <ChallengeCountdown
          challengeEndLedger={proposal.challengeEndLedger}
          isElapsed={proposal.state !== "challenge_window" || challengeElapsed}
        />
      </div>
      {error && <p className="mt-4 text-red-600">{error}</p>}

      <dl className="mt-6 grid gap-3 rounded-xl border p-5 dark:border-slate-700">
        <div>
          <dt className="text-sm text-slate-500">{t("proposerLabel")}</dt>
          <dd className="break-all">{proposal.proposer}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">{t("stateLabel")}</dt>
          <dd>{STATE_LABELS[proposal.state] ?? proposal.state}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">{t("totalObjectionWeight")}</dt>
          <dd>{proposal.objectionVotes.toString()}</dd>
        </div>
      </dl>

      {proposal.state === "challenge_window" && (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t("actionsHeading")}</h2>
            {!publicKey && (
              <span className="text-sm text-slate-500">{t("connectToInteract")}</span>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleObject}
              disabled={!canObject || submitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && actionType === "object" ? tActions("submitting") : t("objectButton")}
            </button>
            <button
              onClick={handleFinalize}
              disabled={!canFinalize || submitting}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && actionType === "finalize" ? tActions("submitting") : t("finalizeButton")}
            </button>
          </div>
          {!publicKey && (
            <p className="mt-2 text-sm text-slate-500">{t("connectToInteract")}</p>
          )}
          {publicKey && hasObjected && (
            <p className="mt-2 text-sm text-slate-500">{t("alreadyObjected")}</p>
          )}
          {publicKey && !hasObjected && votingPower !== null && votingPower <= 0n && (
            <p className="mt-2 text-sm text-slate-500">
              {t("noVotingPower")}
            </p>
          )}
          {publicKey && !challengeElapsed && (
            <p className="mt-2 text-sm text-slate-500">
              {t("challengeStillOpen")}
            </p>
          )}
        </section>
      )}

      {proposal.state === "passed" && (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t("actionsHeading")}</h2>
            {!publicKey && (
              <span className="text-sm text-slate-500">{t("connectToExecute")}</span>
            )}
          </div>
          <div className="mt-4">
            <button
              onClick={handleExecute}
              disabled={!canExecute || submitting}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && actionType === "execute" ? tActions("submitting") : t("executeButton")}
            </button>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{t("objectionsHeading")}</h2>
        <div className="mt-4 grid gap-2">
          {objections.map((objection) => (
            <div
              key={objection.objector}
              className="flex items-center justify-between rounded-lg border p-3 text-sm dark:border-slate-700"
            >
              <span title={objection.objector}>{formatAddress(objection.objector)}</span>
              <span>{objection.weight.toString()}</span>
            </div>
          ))}
          {objections.length === 0 && <p className="text-sm text-slate-500">{t("noObjections")}</p>}
        </div>
      </section>
    </main>
  );
}

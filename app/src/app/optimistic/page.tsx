"use client";

/**
 * Optimistic-governance proposals list (Issue #993).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { OptimisticGovernorClient, VotesClient } from "@nebgov/sdk";
import { readGovernorConfig } from "../../lib/nebgov-env";
import {
  useOptimisticProposals,
  type OptimisticProposalView,
} from "../../hooks/useOptimisticProposals";
import { ChallengeCountdown } from "../../components/ChallengeCountdown";
import { useLedgerClock } from "../../lib/hooks/useLedgerClock";
import { useTranslations } from "next-intl";

function ProposalCard({
  proposal,
  currentLedger,
  thresholdBps,
  totalSupply,
}: {
  proposal: OptimisticProposalView;
  currentLedger: number;
  thresholdBps: number | null;
  totalSupply: bigint | null;
}) {
  const t = useTranslations("optimistic");
  const tCard = useTranslations("proposalCard");
  const thresholdAmount =
    thresholdBps !== null && totalSupply !== null
      ? (totalSupply * BigInt(thresholdBps)) / 10_000n
      : null;
  const progressPct =
    thresholdAmount && thresholdAmount > 0n
      ? Math.min(100, Number((proposal.objectionVotes * 100n) / thresholdAmount))
      : 0;

  return (
    <Link
      key={proposal.proposalId}
      href={`/optimistic/${proposal.proposalId}`}
      className="block rounded-xl border border-slate-200 p-5 transition hover:border-indigo-500 dark:border-slate-700"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">{tCard("proposalNumber", { id: proposal.proposalId })}</h2>
        <ChallengeCountdown
          challengeEndLedger={proposal.challengeEndLedger}
          isElapsed={proposal.state !== "challenge_window" || currentLedger >= proposal.challengeEndLedger}
        />
      </div>
      <p className="mt-2 truncate text-sm text-slate-500" title={proposal.proposer}>
        {t("proposer", { address: proposal.proposer })}
      </p>
      {proposal.state === "challenge_window" && (
        <>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full ${progressPct >= 100 ? "bg-red-600" : "bg-amber-500"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {t("objectionWeight", { weight: proposal.objectionVotes.toString() })}
            {thresholdAmount !== null ? t("toFreeze", { threshold: thresholdAmount.toString() }) : ""}
          </p>
        </>
      )}
    </Link>
  );
}

export default function OptimisticProposalsPage() {
  const [statusFilter, setStatusFilter] = useState<OptimisticProposalView["state"] | undefined>(
    undefined,
  );
  const { proposals, loading, error } = useOptimisticProposals(statusFilter);
  const { currentLedger } = useLedgerClock();
  const [thresholdBps, setThresholdBps] = useState<number | null>(null);
  const [totalSupply, setTotalSupply] = useState<bigint | null>(null);
  const t = useTranslations("optimistic");
  const tHome = useTranslations("home");

  const GROUPS: { status: OptimisticProposalView["state"]; labelKey: string }[] = [
    { status: "challenge_window", labelKey: "filterChallengeWindow" },
    { status: "passed", labelKey: "filterPassed" },
    { status: "executed", labelKey: "filterExecuted" },
    { status: "cancelled", labelKey: "stateCancelled" },
  ];

  useEffect(() => {
    const config = readGovernorConfig();
    if (!config || !config.optimisticGovernorAddress || currentLedger === 0) return;
    void (async () => {
      try {
        const client = new OptimisticGovernorClient(config);
        const settings = await client.getConfig();
        setThresholdBps(settings.objectionThresholdBps);
        const votes = new VotesClient(config);
        const supply = await votes.getPastTotalSupply(currentLedger);
        setTotalSupply(supply);
      } catch {
        // Optimistic governance not deployed/configured — leave the
        // progress bar's denominator unavailable rather than erroring.
      }
    })();
  }, [currentLedger]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">
        {t("subtitle")}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter(undefined)}
          className={`rounded-full px-3 py-1 text-sm ${!statusFilter ? "bg-indigo-600 text-white" : "border border-slate-300 dark:border-slate-600"}`}
        >
          {tHome("filterAll")}
        </button>
        {GROUPS.map((group) => (
          <button
            key={group.status}
            onClick={() => setStatusFilter(group.status)}
            className={`rounded-full px-3 py-1 text-sm ${statusFilter === group.status ? "bg-indigo-600 text-white" : "border border-slate-300 dark:border-slate-600"}`}
          >
            {t(group.labelKey as any)}
          </button>
        ))}
      </div>

      {loading && <p className="mt-8">{t("noProposals")}</p>}
      {error && <p className="mt-8 text-red-600">{error}</p>}

      <div className="mt-8 grid gap-4">
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.proposalId}
            proposal={proposal}
            currentLedger={currentLedger}
            thresholdBps={thresholdBps}
            totalSupply={totalSupply}
          />
        ))}
        {!loading && !error && proposals.length === 0 && (
          <p>{t("noProposals")}</p>
        )}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Gift } from "lucide-react";
import { useClaimableRewards } from "../hooks/useVotingRewards";

interface VotingRewardsPromptProps {
  address: string | null;
}

export function VotingRewardsPrompt({ address }: VotingRewardsPromptProps) {
  const t = useTranslations("rewards");
  const { totalUnclaimed, unclaimed, loading, error } = useClaimableRewards(address);

  if (!address || loading || error || unclaimed.length === 0) return null;

  const amount = Number(totalUnclaimed);
  const formatted = Number.isFinite(amount)
    ? new Intl.NumberFormat("en").format(amount)
    : totalUnclaimed.toString();

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-800 dark:bg-emerald-900/20">
      <div className="flex items-start gap-3">
        <Gift
          className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            {t("votingEarnsRewards", { amount: formatted })}
          </p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
            {t("acrossEpochs", { count: unclaimed.length })}
          </p>
        </div>
      </div>
      <Link
        href="/rewards"
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
      >
        {t("claimRewards")}
      </Link>
    </div>
  );
}

"use client";

import { CheckCircle2, Clock, Gift } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import type { ClaimableRewardRow, RewardEpochSummary } from "../hooks/useVotingRewards";

interface EpochRewardCardProps {
  epoch: RewardEpochSummary;
  reward?: ClaimableRewardRow;
  onClaim?: () => void;
  claiming?: boolean;
}

export function EpochRewardCard({ epoch, reward, onClaim, claiming }: EpochRewardCardProps) {
  const t = useTranslations("rewards");
  const format = useFormatter();
  const published = epoch.publishedAt !== null;
  const claimable = published && reward !== undefined && !reward.claimed;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {t("epochLabel")} {epoch.epochId.toString()}
            </span>
            {published ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                {t("published")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {t("awaitingPublication")}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t("ledgerRange", { start: format.number(epoch.startLedger), end: format.number(epoch.endLedger), pool: format.number(Number(epoch.totalRewardAmount)) })}
          </p>
        </div>

        <div className="text-right">
          {reward ? (
            <>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {format.number(Number(reward.amount))}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {reward.claimed ? t("claimed") : published ? t("readyToClaim") : t("pending")}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noReward")}</p>
          )}
        </div>
      </div>

      {claimable && onClaim && (
        <button
          onClick={onClaim}
          disabled={claiming}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          <Gift className="h-4 w-4" aria-hidden="true" />
          {claiming ? t("claiming") : `${t("claim")} ${format.number(Number(reward!.amount))}`}
        </button>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useEpochLeaderboard } from "../hooks/useVotingRewards";
import { Skeleton } from "./ui/Skeleton";

function formatAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatAmount(amount: bigint): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount.toString();
  return new Intl.NumberFormat("en").format(n);
}

interface RewardsLeaderboardProps {
  epochId: bigint | null;
  /** Highlighted in the table when it appears — the connected wallet. */
  highlightAddress?: string | null;
  limit?: number;
  onRefetchReady?: (refetch: () => void) => void;
}

/** Top earners for one reward epoch (Issue #1011). */
export function RewardsLeaderboard({
  epochId,
  highlightAddress,
  limit = 10,
  onRefetchReady,
}: RewardsLeaderboardProps) {
  const t = useTranslations("rewardsLeaderboard");
  const { rows, loading, error, refetch } = useEpochLeaderboard(epochId, limit);

  useEffect(() => {
    onRefetchReady?.(refetch);
  }, [onRefetchReady, refetch]);

  if (epochId === null) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("noPublishedEpoch")}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("noVotersInEpoch", { epochId: epochId.toString() })}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">
          {t("topVotingRewardEarners", { epochId: epochId.toString() })}
        </caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <th scope="col" className="py-2 pr-4">
              #
            </th>
            <th scope="col" className="py-2 pr-4">
              {t("voter")}
            </th>
            <th scope="col" className="py-2 pr-4 text-right">
              {t("reward")}
            </th>
            <th scope="col" className="py-2 text-right">
              {t("status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isYou = highlightAddress !== null && highlightAddress === row.address;
            return (
              <tr
                key={row.address}
                className={`border-t border-gray-100 dark:border-gray-800 ${
                  isYou ? "bg-indigo-50/60 dark:bg-indigo-900/20" : ""
                }`}
              >
                <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{index + 1}</td>
                <td className="py-2 pr-4 font-mono text-gray-900 dark:text-gray-100">
                  {formatAddress(row.address)}
                  {isYou && (
                    <span className="ml-2 text-xs font-sans text-indigo-600 dark:text-indigo-300">
                      {t("you")}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right text-gray-900 dark:text-gray-100">
                  {formatAmount(row.amount)}
                </td>
                <td className="py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                  {row.claimed ? t("claimed") : t("unclaimed")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

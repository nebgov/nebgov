"use client";

import { ProposerLeaderboard } from "../../components/ProposerLeaderboard";

/**
 * Leaderboard page — renders the ProposerLeaderboard component on its own
 * route so the (already fully implemented) top-proposers table is reachable
 * from the app's primary navigation (Issue #802).
 */
export default function LeaderboardPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Proposer Leaderboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Top proposers ranked by reputation score.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <ProposerLeaderboard limit={50} />
      </div>
    </div>
  );
}
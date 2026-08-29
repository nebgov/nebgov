"use client";

import { useState } from "react";
import type { TuningConfig } from "@nebgov/sdk";

interface GovernanceTuningConfigEditorProps {
  config: TuningConfig;
  onUpdate: (patch: Partial<Omit<TuningConfig, "updatedAt">>) => Promise<void>;
}

export function GovernanceTuningConfigEditor({
  config,
  onUpdate,
}: GovernanceTuningConfigEditorProps) {
  const [minQuorumNumerator, setMinQuorumNumerator] = useState(config.minQuorumNumerator);
  const [maxQuorumNumerator, setMaxQuorumNumerator] = useState(config.maxQuorumNumerator);
  const [maxQuorumDeltaBps, setMaxQuorumDeltaBps] = useState(config.maxQuorumDeltaBps);
  const [minProposalThreshold, setMinProposalThreshold] = useState(
    config.minProposalThreshold.toString(),
  );
  const [maxProposalThreshold, setMaxProposalThreshold] = useState(
    config.maxProposalThreshold === null ? "" : config.maxProposalThreshold.toString(),
  );
  const [maxThresholdDeltaBps, setMaxThresholdDeltaBps] = useState(config.maxThresholdDeltaBps);
  const [trailingWindow, setTrailingWindow] = useState(config.trailingWindow);
  const [intervalMs, setIntervalMs] = useState(config.intervalMs);
  const [autoPropose, setAutoPropose] = useState(config.autoPropose);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      await onUpdate({
        minQuorumNumerator,
        maxQuorumNumerator,
        maxQuorumDeltaBps,
        minProposalThreshold: BigInt(minProposalThreshold || "0"),
        maxProposalThreshold: maxProposalThreshold === "" ? null : BigInt(maxProposalThreshold),
        maxThresholdDeltaBps,
        trailingWindow,
        intervalMs,
        autoPropose,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update config");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-900/20 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-900/20 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          Config updated successfully.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">Min quorum numerator</span>
          <input
            type="number"
            value={minQuorumNumerator}
            onChange={(e) => setMinQuorumNumerator(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">Max quorum numerator</span>
          <input
            type="number"
            value={maxQuorumNumerator}
            onChange={(e) => setMaxQuorumNumerator(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">Max quorum delta (bps)</span>
          <input
            type="number"
            value={maxQuorumDeltaBps}
            onChange={(e) => setMaxQuorumDeltaBps(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">Min proposal threshold</span>
          <input
            type="text"
            value={minProposalThreshold}
            onChange={(e) => setMinProposalThreshold(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">Max proposal threshold</span>
          <input
            type="text"
            value={maxProposalThreshold}
            onChange={(e) => setMaxProposalThreshold(e.target.value)}
            placeholder="No limit"
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">Max threshold delta (bps)</span>
          <input
            type="number"
            value={maxThresholdDeltaBps}
            onChange={(e) => setMaxThresholdDeltaBps(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">Trailing window (snapshots)</span>
          <input
            type="number"
            value={trailingWindow}
            onChange={(e) => setTrailingWindow(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">Interval (ms)</span>
          <input
            type="number"
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={autoPropose}
          onChange={(e) => setAutoPropose(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 dark:border-gray-700"
        />
        <span className="font-medium text-gray-700 dark:text-gray-200">Auto-propose recommendations</span>
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Save Config"}
      </button>
    </form>
  );
}

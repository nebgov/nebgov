"use client";

import React from "react";

/**
 * ConcentrationGauge — a simple colored gauge (healthy / watch / risky
 * bands) for the Nakamoto coefficient, since a raw number means little
 * without context.
 *
 * Bands (default):
 *   - Nakamoto coefficient ≥ 10 → healthy (green)
 *   - 5 ≤ coefficient < 10        → watch (amber)
 *   - coefficient < 5             → risky (red)
 *
 * The gauge renders as a horizontal bar with a marker positioned at the
 * current coefficient value (values are clamped to [1, 20] for display).
 */

interface ConcentrationGaugeProps {
  /** Current Nakamoto coefficient value. */
  value: number;
  /** Optional custom band thresholds: [healthyMin, watchMin]. */
  bands?: { healthyMin: number; watchMin: number };
}

const BAND_COLORS = {
  healthy: "#22c55e",
  watch: "#f59e0b",
  risky: "#ef4444",
};

export function ConcentrationGauge({
  value,
  bands = { healthyMin: 10, watchMin: 5 },
}: ConcentrationGaugeProps) {
  const clamped = Math.max(1, Math.min(20, value));
  // Map coefficient (1..20) to a 0-100% position on the bar
  const positionPct = ((clamped - 1) / 19) * 100;

  const band =
    value >= bands.healthyMin
      ? "healthy"
      : value >= bands.watchMin
        ? "watch"
        : "risky";

  const label =
    band === "healthy"
      ? "Healthy"
      : band === "watch"
        ? "Watch"
        : "Risky";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Nakamoto coefficient
        </span>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>

      {/* Colored band bar */}
      <div className="relative h-3 w-full overflow-hidden rounded-full">
        <div className="absolute inset-0 flex">
          <div className="h-full" style={{ width: "25%", backgroundColor: BAND_COLORS.risky }} />
          <div className="h-full" style={{ width: "25%", backgroundColor: BAND_COLORS.watch }} />
          <div className="h-full" style={{ width: "50%", backgroundColor: BAND_COLORS.healthy }} />
        </div>
        {/* Marker */}
        <div
          className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900 shadow dark:bg-white"
          style={{ left: `${positionPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span>1</span>
        <span
          className="rounded-full px-2 py-0.5 font-semibold text-white"
          style={{ backgroundColor: BAND_COLORS[band] }}
        >
          {label}
        </span>
        <span>20</span>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {band === "healthy"
          ? "Voting power is sufficiently distributed across many addresses."
          : band === "watch"
            ? "Concentration is elevated — monitor delegate concentration closely."
            : "Voting power is highly concentrated — a small number of addresses could control governance."}
      </p>
    </div>
  );
}
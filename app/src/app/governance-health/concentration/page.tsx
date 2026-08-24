"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
} from "recharts";
import { useTheme } from "../../../hooks/useTheme";
import { useConcentration } from "../../../hooks/useConcentration";
import { ConcentrationGauge } from "../../../components/ConcentrationGauge";

const COLORS = ["#60a5fa", "#34d399", "#f97316", "#a78bfa", "#f87171"];

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export default function GovernanceHealthConcentrationPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { latestSnapshot, history, topHolders, topDelegates, loading, error } =
    useConcentration();

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <h1 className="text-2xl font-bold">Concentration &amp; Decentralization Risk</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <h1 className="text-2xl font-bold">Concentration Monitor</h1>
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Failed to load concentration data: {error}
        </div>
      </div>
    );
  }

  const gaugeValue = latestSnapshot?.nakamotoCoefficient ?? 0;

  const holderChartData = topHolders.slice(0, 10).map((h, i) => ({
    name: h.address.slice(0, 8) + "…" + h.address.slice(-4),
    share: h.shareBps / 100,
    address: h.address,
  }));

  const delegateChartData = topDelegates.slice(0, 10).map((h, i) => ({
    name: h.address.slice(0, 8) + "…" + h.address.slice(-4),
    share: h.shareBps / 100,
    address: h.address,
  }));

  const historyChartData = [...history].reverse().map((s) => ({
    ledger: s.ledger,
    top1: s.top1ShareBps / 100,
    top5: s.top5ShareBps / 100,
    top10: s.top10ShareBps / 100,
    gini: (s.giniCoefficientBps / 100).toFixed(1),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Concentration &amp; Decentralization Risk</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            How concentrated is voting power across holders and delegates?
            {latestSnapshot && (
              <span className="ml-2 text-slate-400">
                Last computed at ledger {latestSnapshot.ledger}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Headline metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Gini coefficient</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {latestSnapshot ? formatBps(latestSnapshot.giniCoefficientBps) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            0% = perfect equality · 100% = one address holds everything
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Top-5 holder share</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {latestSnapshot ? formatBps(latestSnapshot.top5ShareBps) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Share of total voting power held by the largest 5 addresses
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Delegate top-5 share</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {latestSnapshot ? formatBps(latestSnapshot.delegateTop5ShareBps) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Top 5 delegates&apos; share of received voting power
          </p>
        </div>
      </div>

      <ConcentrationGauge value={gaugeValue} />

      {/* History chart */}
      {history.length > 1 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-2 text-lg font-semibold">Top-N share over time</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
                <XAxis
                  dataKey="ledger"
                  stroke={isDark ? "#94a3b8" : "#64748b"}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  stroke={isDark ? "#94a3b8" : "#64748b"}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number | string) =>
                    typeof value === "number" ? `${value.toFixed(2)}%` : value
                  }
                  contentStyle={{
                    backgroundColor: isDark ? "#1e293b" : "#fff",
                    borderColor: isDark ? "#475569" : "#e2e8f0",
                    color: isDark ? "#e2e8f0" : "#0f172a",
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="top1" name="Top 1" stroke={COLORS[0]} dot={false} />
                <Line type="monotone" dataKey="top5" name="Top 5" stroke={COLORS[1]} dot={false} />
                <Line type="monotone" dataKey="top10" name="Top 10" stroke={COLORS[2]} dot={false} />
                <Line type="monotone" dataKey="gini" name="Gini" stroke={COLORS[3]} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top holders & delegates */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-2 text-lg font-semibold">Top holders</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={holderChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
                <XAxis dataKey="name" stroke={isDark ? "#94a3b8" : "#64748b"} tick={{ fontSize: 10 }} />
                <YAxis
                  stroke={isDark ? "#94a3b8" : "#64748b"}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number | string) =>
                    typeof value === "number" ? `${value.toFixed(2)}%` : value
                  }
                  labelFormatter={(label) => `Holder share`}
                  contentStyle={{
                    backgroundColor: isDark ? "#1e293b" : "#fff",
                    borderColor: isDark ? "#475569" : "#e2e8f0",
                    color: isDark ? "#e2e8f0" : "#0f172a",
                  }}
                />
                <Bar dataKey="share" name="Share" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-2 text-lg font-semibold">Top delegates (by received power)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={delegateChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
                <XAxis dataKey="name" stroke={isDark ? "#94a3b8" : "#64748b"} tick={{ fontSize: 10 }} />
                <YAxis
                  stroke={isDark ? "#94a3b8" : "#64748b"}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number | string) =>
                    typeof value === "number" ? `${value.toFixed(2)}%` : value
                  }
                  labelFormatter={(label) => `Delegate share`}
                  contentStyle={{
                    backgroundColor: isDark ? "#1e293b" : "#fff",
                    borderColor: isDark ? "#475569" : "#e2e8f0",
                    color: isDark ? "#e2e8f0" : "#0f172a",
                  }}
                />
                <Bar dataKey="share" name="Share" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Raw leaderboard tables */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 font-semibold dark:border-slate-700">
            Holders by voting power
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400">
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {topHolders.map((h, i) => (
                <tr key={h.address} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2 font-mono text-xs">{h.address}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {(h.shareBps / 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
              {topHolders.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    No holder data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 font-semibold dark:border-slate-700">
            Delegates by received power
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400">
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {topDelegates.map((h, i) => (
                <tr key={h.address} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2 font-mono text-xs">{h.address}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {(h.shareBps / 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
              {topDelegates.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    No delegate data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
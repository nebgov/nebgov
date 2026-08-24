"use client";

import { useEffect, useState } from "react";
import { ConcentrationSnapshot, HolderShare } from "@nebgov/sdk";

interface UseConcentrationResult {
  latestSnapshot: ConcentrationSnapshot | null;
  history: ConcentrationSnapshot[];
  topHolders: HolderShare[];
  topDelegates: HolderShare[];
  loading: boolean;
  error: string | null;
}

/**
 * Voting-power concentration and decentralization risk monitor
 * (Issue #1012). Fetches data from the indexer's
 * `/analytics/concentration/*` endpoints.
 */
export function useConcentration(): UseConcentrationResult {
  const [latestSnapshot, setLatestSnapshot] = useState<ConcentrationSnapshot | null>(null);
  const [history, setHistory] = useState<ConcentrationSnapshot[]>([]);
  const [topHolders, setTopHolders] = useState<HolderShare[]>([]);
  const [topDelegates, setTopDelegates] = useState<HolderShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchConcentration() {
      setLoading(true);
      setError(null);
      try {
        const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL;

        if (!indexerUrl) {
          throw new Error("NEXT_PUBLIC_INDEXER_URL is not set");
        }

        const [latestResp, historyResp, holdersResp, delegatesResp] = await Promise.all([
          fetch(`${indexerUrl}/analytics/concentration/latest`, { cache: "no-store" }),
          fetch(`${indexerUrl}/analytics/concentration/history?limit=90`, { cache: "no-store" }),
          fetch(`${indexerUrl}/analytics/concentration/top-holders?limit=20`, { cache: "no-store" }),
          fetch(`${indexerUrl}/analytics/concentration/top-delegates?limit=20`, { cache: "no-store" }),
        ]);

        if (cancelled) return;

        if (latestResp.ok) {
          const json = await latestResp.json();
          if (!cancelled) setLatestSnapshot(json);
        }

        if (historyResp.ok) {
          const json = await historyResp.json();
          if (!cancelled) setHistory(json.data ?? []);
        }

        if (holdersResp.ok) {
          const json = await holdersResp.json();
          if (!cancelled) setTopHolders(json.data ?? []);
        }

        if (delegatesResp.ok) {
          const json = await delegatesResp.json();
          if (!cancelled) setTopDelegates(json.data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch concentration data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchConcentration();

    // Poll every 60 seconds for fresh data
    const interval = setInterval(fetchConcentration, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { latestSnapshot, history, topHolders, topDelegates, loading, error };
}
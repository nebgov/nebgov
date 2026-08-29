"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GovernanceTuningClient,
  type TuningConfig,
  type TuningRecommendation,
} from "@nebgov/sdk";
import { readGovernorConfig } from "../lib/nebgov-env";

interface UseGovernanceTuningResult {
  latest: TuningRecommendation | null;
  history: TuningRecommendation[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Governance tuning recommender (issue #998): backend-sourced, not indexer
 * or on-chain — see `GovernanceTuningClient`'s doc comment for why this
 * hook's data source differs from every other governance hook in this app.
 */
export function useGovernanceTuning(): UseGovernanceTuningResult {
  const [latest, setLatest] = useState<TuningRecommendation | null>(null);
  const [history, setHistory] = useState<TuningRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const config = readGovernorConfig();
        if (!config) {
          throw new Error("Missing required environment variables for GovernanceTuningClient");
        }

        const client = new GovernanceTuningClient(config);

        const [latestRec, historyRecs] = await Promise.all([
          client.getLatestRecommendation(),
          client.getRecommendationHistory(20),
        ]);

        if (cancelled) return;
        setLatest(latestRec);
        setHistory(historyRecs);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load governance tuning data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return { latest, history, loading, error, refresh };
}

export interface UseGovernanceTuningConfigResult {
  config: TuningConfig | null;
  loading: boolean;
  error: string | null;
  updateConfig: (patch: Partial<Omit<TuningConfig, "updatedAt">>) => Promise<void>;
  refresh: () => void;
}

/**
 * Fetches and allows admin updates to the governance tuning config.
 */
export function useGovernanceTuningConfig(): UseGovernanceTuningConfigResult {
  const [config, setConfig] = useState<TuningConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const governorConfig = readGovernorConfig();
        if (!governorConfig) {
          throw new Error("Missing required environment variables");
        }

        const client = new GovernanceTuningClient(governorConfig);
        const cfg = await client.getConfig();

        if (cancelled) return;
        setConfig(cfg);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load config");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const updateConfig = useCallback(
    async (patch: Partial<Omit<TuningConfig, "updatedAt">>) => {
      const governorConfig = readGovernorConfig();
      if (!governorConfig) {
        throw new Error("Missing required environment variables");
      }

      const client = new GovernanceTuningClient(governorConfig);
      const updated = await client.updateConfig(patch);
      setConfig(updated);
    },
    [],
  );

  return { config, loading, error, updateConfig, refresh };
}

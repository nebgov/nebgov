"use client";

import { useCallback, useEffect, useState } from "react";
import { ProposalBondsClient, type ProposalBond } from "@nebgov/sdk";
import { readGovernorConfig, readIndexerUrl } from "../lib/nebgov-env";

function buildClient(): ProposalBondsClient | null {
  const config = readGovernorConfig();
  if (!config || !config.proposalBondsAddress) return null;
  const indexerUrl = readIndexerUrl();
  return new ProposalBondsClient({
    ...config,
    ...(indexerUrl ? { indexerUrl } : {}),
  });
}

interface UseBondResult {
  bond: ProposalBond | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Fetch a single proposal bond by description hash, with manual refetch. */
export function useProposalBond(descriptionHash: string | null): UseBondResult {
  const [bond, setBond] = useState<ProposalBond | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);

  useEffect(() => {
    if (!descriptionHash) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const client = buildClient();
    if (!client) {
      setError("Proposal-bonds registry is not configured.");
      setLoading(false);
      return;
    }

    client
      .getBond(descriptionHash)
      .then((result) => {
        if (!cancelled) setBond(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [descriptionHash, refetchToken]);

  const refetch = useCallback(() => setRefetchToken((t) => t + 1), []);

  return { bond, loading, error, refetch };
}

interface UseBondsByProposerResult {
  bonds: ProposalBond[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Fetch every bond posted by a given proposer address, most-recent first. */
export function useBondsByProposer(address: string | null): UseBondsByProposerResult {
  const [bonds, setBonds] = useState<ProposalBond[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const client = buildClient();
    if (!client) {
      setError("Proposal-bonds registry is not configured.");
      setLoading(false);
      return;
    }

    client
      .getBondsByProposer(address)
      .then((result) => {
        if (!cancelled) setBonds(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, refetchToken]);

  const refetch = useCallback(() => setRefetchToken((t) => t + 1), []);

  return { bonds, loading, error, refetch };
}

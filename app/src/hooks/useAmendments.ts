import { useState, useEffect, useCallback } from "react";
import type { ProposalAmendment, JsonMergePatch } from "@nebgov/sdk/amendments";

export interface UseAmendmentsResult {
  amendments: ProposalAmendment[];
  currentVersion: number;
  loading: boolean;
  error: Error | null;
  diff: JsonMergePatch[] | null;
  fetchAmendments: () => Promise<void>;
  fetchDiff: (fromVersion: number, toVersion: number) => Promise<void>;
  submitAmendment: (amendment: any) => Promise<void>;
  publishAmendment: (version: number) => Promise<void>;
}

/**
 * Hook for managing proposal amendments
 */
export function useAmendments(proposalId: number, baseUrl: string = "http://localhost:3001"): UseAmendmentsResult {
  const [amendments, setAmendments] = useState<ProposalAmendment[]>([]);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [diff, setDiff] = useState<JsonMergePatch[] | null>(null);

  const fetchAmendments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${baseUrl}/proposals/${proposalId}/amendments`);
      if (!response.ok) {
        throw new Error(`Failed to fetch amendments: ${response.statusText}`);
      }

      const data = await response.json();
      setAmendments(data.amendments);
      setCurrentVersion(data.current_amendment_version);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [proposalId, baseUrl]);

  const fetchDiff = useCallback(
    async (fromVersion: number, toVersion: number) => {
      try {
        const response = await fetch(
          `${baseUrl}/proposals/${proposalId}/amendment-diff/${fromVersion}/${toVersion}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch diff: ${response.statusText}`);
        }

        const data = await response.json();
        setDiff(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [proposalId, baseUrl],
  );

  const submitAmendment = useCallback(
    async (amendment: any) => {
      try {
        const response = await fetch(`${baseUrl}/proposals/${proposalId}/amend`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(amendment),
        });

        if (!response.ok) {
          throw new Error(`Failed to submit amendment: ${response.statusText}`);
        }

        // Refresh amendments after submission
        await fetchAmendments();
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [proposalId, baseUrl, fetchAmendments],
  );

  const publishAmendment = useCallback(
    async (version: number) => {
      try {
        const response = await fetch(`${baseUrl}/proposals/${proposalId}/publish-amendment/${version}`, {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(`Failed to publish amendment: ${response.statusText}`);
        }

        // Refresh amendments after publishing
        await fetchAmendments();
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [proposalId, baseUrl, fetchAmendments],
  );

  // Fetch amendments on mount
  useEffect(() => {
    fetchAmendments();
  }, [fetchAmendments]);

  return {
    amendments,
    currentVersion,
    loading,
    error,
    diff,
    fetchAmendments,
    fetchDiff,
    submitAmendment,
    publishAmendment,
  };
}

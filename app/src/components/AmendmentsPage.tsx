"use client";

import React, { useState, useEffect } from "react";
import { useAmendments } from "@/hooks/useAmendments";
import { AmendmentTimeline } from "./AmendmentTimeline";

interface AmendmentsPageProps {
  proposalId: number;
  isProposer?: boolean;
  isPending?: boolean;
}

/**
 * Full page component for managing proposal amendments
 */
export function AmendmentsPage({ proposalId, isProposer = false, isPending = true }: AmendmentsPageProps) {
  const { amendments, currentVersion, loading, error, diff, fetchAmendments, fetchDiff, submitAmendment, publishAmendment } = useAmendments(proposalId);
  const [compareVersions, setCompareVersions] = useState<[number, number] | null>(null);

  const handleFetchDiff = async (from: number, to: number) => {
    setCompareVersions([from, to]);
    await fetchDiff(from, to);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-600">Loading amendments...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        <p className="font-semibold">Error loading amendments</p>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <AmendmentTimeline
      amendments={amendments}
      currentVersion={currentVersion}
      isProposer={isProposer}
      isPending={isPending}
      onPublish={publishAmendment}
      onSubmitAmendment={submitAmendment}
      diff={diff}
      onFetchDiff={handleFetchDiff}
    />
  );
}

export default AmendmentsPage;

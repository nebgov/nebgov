"use client";

import React from "react";
import type { JsonMergePatch } from "@nebgov/sdk/amendments";

interface AmendmentDiffViewerProps {
  diff: JsonMergePatch[] | null;
  loading?: boolean;
}

/**
 * Component to display RFC 6902-style JSON-Merge-Patch diff
 * Highlights changes between amendment versions
 */
export function AmendmentDiffViewer({ diff, loading = false }: AmendmentDiffViewerProps) {
  if (loading) {
    return <div className="p-4 text-gray-600">Loading diff...</div>;
  }

  if (!diff || diff.length === 0) {
    return <div className="p-4 text-gray-600">No changes between versions</div>;
  }

  return (
    <div className="space-y-3">
      {diff.map((patch, index) => (
        <div key={index} className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm">{patch.path}</span>
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                patch.op === "replace"
                  ? "bg-blue-100 text-blue-800"
                  : patch.op === "remove"
                    ? "bg-red-100 text-red-800"
                    : "bg-green-100 text-green-800"
              }`}
            >
              {patch.op}
            </span>
          </div>

          {patch.value !== undefined && (
            <div className="bg-gray-50 p-3 rounded border border-gray-200 font-mono text-sm">
              {typeof patch.value === "string" ? (
                <p>{patch.value}</p>
              ) : (
                <pre>{JSON.stringify(patch.value, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default AmendmentDiffViewer;

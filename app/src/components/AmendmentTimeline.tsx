"use client";

import React, { useState } from "react";
import type { ProposalAmendment } from "@nebgov/sdk/amendments";
import { AmendmentDiffViewer } from "./AmendmentDiffViewer";

interface AmendmentTimelineProps {
  amendments: ProposalAmendment[];
  currentVersion: number;
  isProposer?: boolean;
  isPending?: boolean;
  onPublish?: (version: number) => Promise<void>;
  onSubmitAmendment?: (amendment: any) => Promise<void>;
  diff: any[] | null;
  onFetchDiff?: (from: number, to: number) => Promise<void>;
}

/**
 * Component to display a timeline of proposal amendments
 * Shows all versions with diffs and allows proposer to amend or publish
 */
export function AmendmentTimeline({
  amendments,
  currentVersion,
  isProposer = false,
  isPending = true,
  onPublish,
  onSubmitAmendment,
  diff,
  onFetchDiff,
}: AmendmentTimelineProps) {
  const [selectedVersion, setSelectedVersion] = useState(currentVersion);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    description: "",
    target_address: "",
    function_name: "",
    calldata_hex: "",
    reason: "",
  });
  const [publishing, setPublishing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handlePublish = async (version: number) => {
    if (!onPublish) return;

    try {
      setPublishing(true);
      await onPublish(version);
    } finally {
      setPublishing(false);
    }
  };

  const handleSubmitAmendment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmitAmendment) return;

    try {
      setSubmitting(true);
      await onSubmitAmendment({
        description: formData.description || undefined,
        target_address: formData.target_address || undefined,
        function_name: formData.function_name || undefined,
        calldata_hex: formData.calldata_hex || undefined,
        reason: formData.reason || undefined,
      });

      // Reset form
      setFormData({
        description: "",
        target_address: "",
        function_name: "",
        calldata_hex: "",
        reason: "",
      });
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompare = (version: number) => {
    if (onFetchDiff && selectedVersion !== version) {
      onFetchDiff(Math.min(selectedVersion, version), Math.max(selectedVersion, version));
    }
  };

  return (
    <div className="space-y-6">
      {/* Amendment List */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-lg">Amendment Timeline</h3>
          <p className="text-sm text-gray-600">
            Currently viewing: <span className="font-mono">Version {currentVersion}</span>
          </p>
        </div>

        <div className="space-y-2">
          {amendments.map((amendment) => (
            <div
              key={amendment.version}
              className={`px-4 py-4 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                amendment.version === currentVersion ? "bg-blue-50" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono bg-gray-200 px-2 py-1 rounded text-sm">
                      v{amendment.version}
                    </span>
                    {amendment.version === currentVersion && (
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-semibold">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    By: <span className="font-mono">{amendment.amended_by.slice(0, 16)}...</span>
                  </p>
                  <p className="text-sm text-gray-700">
                    {amendment.reason || amendment.description || "No description"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleCompare(amendment.version)}
                    className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium"
                  >
                    Compare
                  </button>

                  {isProposer && isPending && amendment.version !== currentVersion && onPublish && (
                    <button
                      onClick={() => handlePublish(amendment.version)}
                      disabled={publishing}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50"
                    >
                      {publishing ? "Publishing..." : "Publish"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Diff Viewer */}
      {diff && (
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold mb-4">Changes</h4>
          <AmendmentDiffViewer diff={diff} />
        </div>
      )}

      {/* Amendment Form */}
      {isProposer && isPending && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <button
              onClick={() => setShowForm(!showForm)}
              className="font-semibold text-blue-600 hover:text-blue-700"
            >
              {showForm ? "Cancel" : "+ Create Amendment"}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmitAmendment} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-serif"
                  placeholder="Updated proposal description"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Address
                  </label>
                  <input
                    type="text"
                    value={formData.target_address}
                    onChange={(e) => setFormData({ ...formData, target_address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    placeholder="C..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Function Name
                  </label>
                  <input
                    type="text"
                    value={formData.function_name}
                    onChange={(e) => setFormData({ ...formData, function_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="function_name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Calldata</label>
                <input
                  type="text"
                  value={formData.calldata_hex}
                  onChange={(e) => setFormData({ ...formData, calldata_hex: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Amendment
                </label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g., Fixed typo, Clarified intent"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Amendment"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default AmendmentTimeline;

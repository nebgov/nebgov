import React from "react";
import { AmendmentsPage } from "@/components/AmendmentsPage";

/**
 * Amendments page for a proposal
 * Shows all amendments, allows proposer to create and publish new ones
 */
export default function ProposalAmendmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return React.use(Promise.resolve(params)).then(({ id }) => (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-2">Proposal Amendments</h1>
        <p className="text-gray-600 mb-8">Proposal ID: {id}</p>
        <AmendmentsPage proposalId={Number(id)} />
      </div>
    </div>
  ));
}

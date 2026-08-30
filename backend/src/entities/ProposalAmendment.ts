export interface ProposalAmendment {
  id: number;
  proposal_id: number;
  version: number;
  amended_by: string;
  amended_at: Date;
  description: string | null;
  target_address: string | null;
  function_name: string | null;
  calldata_hex: string | null;
  reason: string | null;
  created_at: Date;
}

export interface AmendmentInput {
  description?: string;
  target_address?: string;
  function_name?: string;
  calldata_hex?: string;
  reason?: string;
}

export interface ProposalWithAmendments {
  proposal_id: number;
  current_amendment_version: number;
  amendments: ProposalAmendment[];
}

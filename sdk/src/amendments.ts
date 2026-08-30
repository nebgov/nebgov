import { Keypair } from "@stellar/stellar-sdk";

export interface ProposalAmendment {
  id: number;
  proposal_id: number;
  version: number;
  amended_by: string;
  amended_at: string;
  description: string | null;
  target_address: string | null;
  function_name: string | null;
  calldata_hex: string | null;
  reason: string | null;
  created_at: string;
}

export interface AmendmentInput {
  description?: string;
  target_address?: string;
  function_name?: string;
  calldata_hex?: string;
  reason?: string;
}

export interface JsonMergePatch {
  op: string;
  path: string;
  value?: unknown;
}

/**
 * Client for proposal amendment operations
 * Handles creation, publishing, and querying of proposal amendments
 */
export class AmendmentsClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3001") {
    this.baseUrl = baseUrl;
  }

  /**
   * Get all amendments for a proposal, including the original (version 0)
   */
  async getAmendments(proposalId: number): Promise<{ proposal_id: number; current_amendment_version: number; amendments: ProposalAmendment[] }> {
    const response = await fetch(`${this.baseUrl}/proposals/${proposalId}/amendments`);
    if (!response.ok) {
      throw new Error(`Failed to fetch amendments: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get a specific amendment version
   */
  async getAmendmentVersion(proposalId: number, version: number): Promise<ProposalAmendment> {
    const response = await fetch(`${this.baseUrl}/proposals/${proposalId}/amendments/${version}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch amendment version: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Submit a new amendment draft (proposer-only)
   * The amendment is not published until explicitly published
   */
  async submitAmendment(
    proposerKeypair: Keypair,
    proposalId: number,
    amendment: AmendmentInput,
  ): Promise<ProposalAmendment> {
    const proposerAddress = proposerKeypair.publicKey();

    const response = await fetch(`${this.baseUrl}/proposals/${proposalId}/amend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Proposer-Address": proposerAddress,
      },
      body: JSON.stringify(amendment),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit amendment: ${response.statusText}`);
    }

    const data = (await response.json()) as { amendment: ProposalAmendment };
    return data.amendment;
  }

  /**
   * Publish an amendment as the canonical version (proposer-only)
   * Only allowed in Pending state
   */
  async publishAmendment(
    proposerKeypair: Keypair,
    proposalId: number,
    version: number,
  ): Promise<void> {
    const proposerAddress = proposerKeypair.publicKey();

    const response = await fetch(`${this.baseUrl}/proposals/${proposalId}/publish-amendment/${version}`, {
      method: "POST",
      headers: {
        "X-Proposer-Address": proposerAddress,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to publish amendment: ${response.statusText}`);
    }
  }

  /**
   * Get a JSON-Merge-Patch diff between two amendment versions
   */
  async getAmendmentDiff(
    proposalId: number,
    fromVersion: number,
    toVersion: number,
  ): Promise<JsonMergePatch[]> {
    const response = await fetch(
      `${this.baseUrl}/proposals/${proposalId}/amendment-diff/${fromVersion}/${toVersion}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch amendment diff: ${response.statusText}`);
    }

    return response.json();
  }
}

export default AmendmentsClient;

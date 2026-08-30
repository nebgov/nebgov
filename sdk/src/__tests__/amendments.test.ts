import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { Keypair } from "@stellar/stellar-sdk";
import { AmendmentsClient } from "../amendments";

describe("AmendmentsClient", () => {
  let client: AmendmentsClient;
  let fetchSpy: jest.SpyInstance;
  const testProposalId = 12345;
  const testKeypair = Keypair.random();

  beforeEach(() => {
    client = new AmendmentsClient("http://localhost:3001");
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getAmendments", () => {
    it("should fetch all amendments for a proposal", async () => {
      const mockResponse = {
        proposal_id: testProposalId,
        current_amendment_version: 1,
        amendments: [
          {
            id: 0,
            proposal_id: testProposalId,
            version: 0,
            amended_by: testKeypair.publicKey(),
            amended_at: "2026-08-30T00:00:00Z",
            description: "Original description",
            target_address: null,
            function_name: null,
            calldata_hex: null,
            reason: "Original proposal",
            created_at: "2026-08-30T00:00:00Z",
          },
          {
            id: 1,
            proposal_id: testProposalId,
            version: 1,
            amended_by: testKeypair.publicKey(),
            amended_at: "2026-08-30T12:00:00Z",
            description: "Updated description",
            target_address: null,
            function_name: null,
            calldata_hex: null,
            reason: "Fixed typo",
            created_at: "2026-08-30T12:00:00Z",
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.getAmendments(testProposalId);

      expect(result).toEqual(mockResponse);
      expect(fetchSpy).toHaveBeenCalledWith(`http://localhost:3001/proposals/${testProposalId}/amendments`);
    });

    it("should throw on fetch failure", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      } as Response);

      await expect(client.getAmendments(testProposalId)).rejects.toThrow("Failed to fetch amendments");
    });
  });

  describe("getAmendmentVersion", () => {
    it("should fetch a specific amendment version", async () => {
      const mockAmendment = {
        id: 1,
        proposal_id: testProposalId,
        version: 1,
        amended_by: testKeypair.publicKey(),
        amended_at: "2026-08-30T12:00:00Z",
        description: "Updated description",
        target_address: null,
        function_name: null,
        calldata_hex: null,
        reason: "Fixed typo",
        created_at: "2026-08-30T12:00:00Z",
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAmendment,
      } as Response);

      const result = await client.getAmendmentVersion(testProposalId, 1);

      expect(result).toEqual(mockAmendment);
      expect(fetchSpy).toHaveBeenCalledWith(
        `http://localhost:3001/proposals/${testProposalId}/amendments/1`,
      );
    });
  });

  describe("submitAmendment", () => {
    it("should submit a new amendment", async () => {
      const amendment = {
        description: "Updated description",
        reason: "Fixed typo",
      };

      const mockResponse = {
        amendment: {
          id: 1,
          proposal_id: testProposalId,
          version: 1,
          amended_by: testKeypair.publicKey(),
          amended_at: "2026-08-30T12:00:00Z",
          ...amendment,
          target_address: null,
          function_name: null,
          calldata_hex: null,
          created_at: "2026-08-30T12:00:00Z",
        },
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.submitAmendment(testKeypair, testProposalId, amendment);

      expect(result.description).toBe("Updated description");
      expect(fetchSpy).toHaveBeenCalledWith(
        `http://localhost:3001/proposals/${testProposalId}/amend`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Proposer-Address": testKeypair.publicKey(),
          }),
        }),
      );
    });
  });

  describe("publishAmendment", () => {
    it("should publish an amendment version", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await client.publishAmendment(testKeypair, testProposalId, 1);

      expect(fetchSpy).toHaveBeenCalledWith(
        `http://localhost:3001/proposals/${testProposalId}/publish-amendment/1`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Proposer-Address": testKeypair.publicKey(),
          }),
        }),
      );
    });
  });

  describe("getAmendmentDiff", () => {
    it("should fetch diff between two amendment versions", async () => {
      const mockDiff = [
        {
          op: "replace",
          path: "/description",
          value: "Updated description",
        },
      ];

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDiff,
      } as Response);

      const result = await client.getAmendmentDiff(testProposalId, 0, 1);

      expect(result).toEqual(mockDiff);
      expect(fetchSpy).toHaveBeenCalledWith(
        `http://localhost:3001/proposals/${testProposalId}/amendment-diff/0/1`,
      );
    });
  });
});

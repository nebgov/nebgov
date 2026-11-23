import { hashDescription } from "@nebgov/sdk";
import { fetchProposalMetadata, verifyMetadataHash } from "../metadata";

// Replace the SDK hash with a controllable stub so these tests exercise only
// the comparison logic in verifyMetadataHash, not the platform crypto backend.
jest.mock("@nebgov/sdk", () => ({
  hashDescription: jest.fn(),
}));

const mockHashDescription = hashDescription as unknown as jest.Mock;

describe("fetchProposalMetadata", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    delete process.env.NEXT_PUBLIC_IPFS_GATEWAY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the body of an HTTPS metadata URI unchanged", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "Proposal body" });

    await expect(fetchProposalMetadata("https://example.test/p.md")).resolves.toBe("Proposal body");
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/p.md");
  });

  it("resolves ipfs URIs through the default public gateway", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "from ipfs" });

    await expect(fetchProposalMetadata("ipfs://QmHash")).resolves.toBe("from ipfs");
    expect(fetchMock).toHaveBeenCalledWith("https://ipfs.io/ipfs/QmHash");
  });

  it("uses NEXT_PUBLIC_IPFS_GATEWAY when it is configured", async () => {
    process.env.NEXT_PUBLIC_IPFS_GATEWAY = "https://gateway.example.test/ipfs/";
    fetchMock.mockResolvedValue({ ok: true, text: async () => "custom gateway" });

    await fetchProposalMetadata("ipfs://QmHash");
    expect(fetchMock).toHaveBeenCalledWith("https://gateway.example.test/ipfs/QmHash");
  });

  it("throws with the status text when the response is not ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, statusText: "Not Found" });

    await expect(fetchProposalMetadata("ipfs://QmMissing")).rejects.toThrow(
      "Failed to fetch metadata from https://ipfs.io/ipfs/QmMissing: Not Found",
    );
  });

  it("propagates network failures", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(fetchProposalMetadata("https://example.test/p.md")).rejects.toThrow("offline");
  });
});

describe("verifyMetadataHash", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts content whose hash matches, ignoring hex case", async () => {
    mockHashDescription.mockResolvedValue("ABCDEF0123");

    await expect(verifyMetadataHash("Proposal text", "abcdef0123")).resolves.toBe(true);
    expect(mockHashDescription).toHaveBeenCalledWith("Proposal text");
  });

  it("rejects tampered content whose hash differs from the on-chain hash", async () => {
    mockHashDescription.mockResolvedValue("1111111111");

    await expect(verifyMetadataHash("Tampered text", "2222222222")).resolves.toBe(false);
  });

  it("propagates hashing failures instead of reporting content as verified", async () => {
    mockHashDescription.mockRejectedValue(new Error("No crypto API available"));

    await expect(verifyMetadataHash("anything", "abc")).rejects.toThrow("No crypto API available");
  });
});

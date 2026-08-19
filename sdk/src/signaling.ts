import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import {
  GovernorConfig,
  Network,
  SignalAnchorRecord,
  SignalingPoll,
  SignalingPollResults,
} from "./types";
import { SignalingError, SignalingErrorCode, parseSignalingError } from "./errors";
import { withRetry, isNetworkError } from "./utils";

const RPC_URLS: Record<Network, string> = {
  mainnet: "https://soroban-rpc.mainnet.stellar.gateway.fm",
  testnet: "https://soroban-testnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
};

const NETWORK_PASSPHRASES: Record<Network, string> = {
  mainnet: Networks.PUBLIC,
  testnet: Networks.TESTNET,
  futurenet: Networks.FUTURENET,
};

const DOMAIN_TAG = "nebgov-signal";

/**
 * Canonical, unambiguous hex digest for a signaling vote:
 * hex(SHA256("nebgov-signal" || poll_id || choice || voter_address ||
 * nonce)).
 *
 * Returned (and signed) as a **hex string**, not raw digest bytes — a
 * wallet extension's SEP-43 `signMessage(message: string)` only accepts a
 * string, so both {@link SignalingClient.castVote} (raw {@link Keypair}) and
 * {@link SignalingClient.castVoteWithSign} (wallet extension) sign the
 * identical UTF-8 bytes of this hex string. Kept in lockstep with
 * `backend/src/signaling/signature.ts`'s `canonicalSignalPayload` — the two
 * are separate implementations (the backend never imports this
 * browser-facing SDK) so a change to one without the other silently breaks
 * vote verification.
 */
async function canonicalSignalPayload(
  pollId: number,
  choiceIndex: number,
  voterAddress: string,
  nonce: string,
): Promise<string> {
  const message = [DOMAIN_TAG, String(pollId), String(choiceIndex), voterAddress, nonce].join("|");
  const bytes = new TextEncoder().encode(message);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new SignalingError(
      SignalingErrorCode.SimulationFailed,
      "Web Crypto (crypto.subtle) is not available in this environment",
    );
  }
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function mapPoll(raw: any): SignalingPoll {
  return {
    id: Number(raw.id),
    creatorAddress: raw.creatorAddress,
    title: raw.title,
    description: raw.description,
    choices: raw.choices,
    snapshotLedger: Number(raw.snapshotLedger),
    startTime: raw.startTime,
    endTime: raw.endTime,
    finalized: Boolean(raw.finalized),
    resultHash: raw.resultHash ?? null,
    anchoredTxHash: raw.anchoredTxHash ?? null,
    createdAt: raw.createdAt,
  };
}

function mapResults(raw: any): SignalingPollResults {
  return {
    finalized: Boolean(raw.finalized),
    choices: raw.choices,
    totals: (raw.totals ?? []).map((t: string) => BigInt(t)),
    totalVotes: Number(raw.totalVotes ?? 0),
    totalWeight: BigInt(raw.totalWeight ?? 0),
    resultHash: raw.resultHash ?? null,
    anchoredTxHash: raw.anchoredTxHash ?? null,
  };
}

/**
 * SignalingClient — create and vote in gasless off-chain signaling polls
 * ("temperature checks"), and independently verify a finalized poll's
 * published result against its optional on-chain anchor.
 *
 * Poll CRUD and vote casting talk to the **backend** (`config.backendUrl`),
 * not the indexer or Soroban RPC — signaling votes are never submitted as
 * transactions. Only {@link SignalingClient.getAnchor} reads on-chain state,
 * via `config.signalAnchorAddress`.
 *
 * @example
 * const client = new SignalingClient({
 *   governorAddress: "CABC...",
 *   timelockAddress: "CDEF...",
 *   votesAddress: "CGHI...",
 *   signalAnchorAddress: "CJKL...",
 *   backendUrl: "https://api.nebgov.dev",
 *   network: "testnet",
 * });
 *
 * const pollId = await client.createPoll(creator, "Fund grant #4?", "...", ["For", "Against"], 1000, new Date(), new Date(Date.now() + 86_400_000));
 * await client.castVote(voter, pollId, 0);
 * const results = await client.getResults(pollId);
 */
export class SignalingClient {
  private readonly config: GovernorConfig;
  private readonly server: SorobanRpc.Server;
  private readonly networkPassphrase: string;

  constructor(config: GovernorConfig) {
    this.config = config;
    const rpcUrl = config.rpcUrl ?? RPC_URLS[config.network];
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    this.networkPassphrase = NETWORK_PASSPHRASES[config.network];
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, {
      maxAttempts: this.config.maxAttempts,
      baseDelayMs: this.config.baseDelayMs,
      retryOn: isNetworkError,
    });
  }

  private async backendRequest<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.config.backendUrl) {
      throw new SignalingError(
        SignalingErrorCode.SimulationFailed,
        "SignalingClient requires config.backendUrl to be set",
      );
    }
    return this.retry(async () => {
      const resp = await fetch(`${this.config.backendUrl}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new SignalingError(
          SignalingErrorCode.TransactionFailed,
          body?.error ?? `Backend request failed: ${resp.status}`,
        );
      }
      return resp.json() as Promise<T>;
    });
  }

  // ── Poll CRUD (backend-backed) ─────────────────────────────────────────────

  /**
   * Create a signaling poll. `creator` (a {@link Keypair} or a bare Stellar
   * address string, for wallet-extension flows where the SDK never sees a
   * private key) must currently hold at least the governor's
   * `proposal_threshold` in voting power — this is checked by the backend,
   * not by this method. Creation itself is unsigned: it's a public-record
   * bar check, not a fund-moving or vote-casting action.
   */
  async createPoll(
    creator: Keypair | string,
    title: string,
    description: string,
    choices: string[],
    snapshotLedger: number,
    startTime: Date,
    endTime: Date,
  ): Promise<number> {
    const creatorAddress = typeof creator === "string" ? creator : creator.publicKey();
    const raw = await this.backendRequest<any>("/signaling/polls", {
      method: "POST",
      body: JSON.stringify({
        creatorAddress,
        title,
        description,
        choices,
        snapshotLedger,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      }),
    });
    return Number(raw.id);
  }

  /**
   * Cast a gasless signal: builds the canonical payload, signs it with
   * `voter`, and POSTs it to the backend. No on-chain transaction is
   * submitted.
   */
  async castVote(voter: Keypair, pollId: number, choiceIndex: number): Promise<void> {
    const nonce = generateNonce();
    const digestHex = await canonicalSignalPayload(pollId, choiceIndex, voter.publicKey(), nonce);
    const signature = Buffer.from(voter.sign(Buffer.from(digestHex, "utf8"))).toString("base64");

    await this.backendRequest(`/signaling/polls/${pollId}/vote`, {
      method: "POST",
      headers: { "X-Voter-Address": voter.publicKey() },
      body: JSON.stringify({ choiceIndex, nonce, signature }),
    });
  }

  /**
   * Same as {@link castVote}, but accepts a wallet-extension SEP-43
   * `signMessage` callback instead of a raw {@link Keypair} — for browser
   * dApps where the private key is never exposed to the SDK. `signMessage`
   * is expected to return a base64-encoded signature (see
   * `app/src/lib/wallet-context.tsx`'s `signMessage`).
   */
  async castVoteWithSign(
    voterPublicKey: string,
    signMessage: (message: string) => Promise<string>,
    pollId: number,
    choiceIndex: number,
  ): Promise<void> {
    const nonce = generateNonce();
    const digestHex = await canonicalSignalPayload(pollId, choiceIndex, voterPublicKey, nonce);
    const signature = await signMessage(digestHex);

    await this.backendRequest(`/signaling/polls/${pollId}/vote`, {
      method: "POST",
      headers: { "X-Voter-Address": voterPublicKey },
      body: JSON.stringify({ choiceIndex, nonce, signature }),
    });
  }

  async getPoll(pollId: number): Promise<SignalingPoll> {
    const raw = await this.backendRequest<any>(`/signaling/polls/${pollId}`);
    return mapPoll(raw);
  }

  async listPolls(status?: "active" | "closed"): Promise<SignalingPoll[]> {
    const params = status ? `?status=${status}` : "";
    const raw = await this.backendRequest<any[]>(`/signaling/polls${params}`);
    return raw.map(mapPoll);
  }

  async getResults(pollId: number): Promise<SignalingPollResults> {
    const raw = await this.backendRequest<any>(`/signaling/polls/${pollId}/results`);
    return mapResults(raw);
  }

  // ── On-chain read (signal-anchor contract) ─────────────────────────────────

  /**
   * Read the finalized on-chain anchor for `pollId`, for verifying a
   * finalized poll's published `resultHash` matches the anchor. Returns
   * `null` if the poll's result was never anchored (anchoring is optional
   * and off by default — see the backend's `SIGNAL_ANCHOR_ON_CHAIN` flag).
   */
  async getAnchor(pollId: number): Promise<SignalAnchorRecord | null> {
    if (!this.config.signalAnchorAddress) {
      throw new SignalingError(
        SignalingErrorCode.SimulationFailed,
        "SignalingClient.getAnchor requires config.signalAnchorAddress to be set",
      );
    }
    const contract = new Contract(this.config.signalAnchorAddress);
    const readAccount = this.config.simulationAccount ?? this.config.governorAddress;

    return this.retry(async () => {
      const result = await this.server.simulateTransaction(
        new TransactionBuilder(await this.server.getAccount(readAccount), {
          fee: BASE_FEE,
          networkPassphrase: this.networkPassphrase,
        })
          .addOperation(contract.call("get_anchor", nativeToScVal(pollId, { type: "u64" })))
          .setTimeout(30)
          .build(),
      );

      if (SorobanRpc.Api.isSimulationError(result)) {
        throw parseSignalingError({ status: "ERROR", error: result.error });
      }

      const raw = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
      if (!raw) {
        throw new SignalingError(SignalingErrorCode.MissingReturnValue, "No return value from get_anchor");
      }
      const native = scValToNative(raw) as
        | { poll_id: bigint; result_hash: Uint8Array; anchored_ledger: number; anchorer: string }
        | undefined;
      if (!native) return null;

      return {
        pollId: BigInt(native.poll_id),
        resultHash: Buffer.from(native.result_hash).toString("hex"),
        anchoredLedger: Number(native.anchored_ledger),
        anchorer: native.anchorer,
      };
    });
  }
}

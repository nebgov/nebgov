import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  GovernorConfig,
  GovernorSettings,
  GovernorSettingsValidationLimits,
  VoteSupport,
  VoteType,
  Network,
  Proposal,
  ProposalState,
  ProposalVotes,
  CanProposeResult,
  VotingHistoryEntry,
  TimelockInfo,
  ExecutionGasEstimate,
} from "../types";

import { GovernorError, GovernorErrorCode, parseGovernorError } from "../errors";
import { hexToBytes32, withRetry } from "../utils";

// These modules import `GovernorClient` from this file too (each free
// function takes the client as its first argument). The cycle is safe here
// because every usage below is inside a method body, not at module-eval
// time, so by the time these run, both modules have finished loading.
import * as proposalsModule from "./proposals";
import * as votingModule from "./voting";
import * as queriesModule from "./queries";
import * as executionModule from "./execution";
import * as eventsModule from "./events";

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

const DEFAULT_MAX_VOTING_DELAY = 1_209_600;
const DEFAULT_MIN_VOTING_PERIOD = 1;

export function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return 0n;
}

export function simulationCostValue(
  cost: unknown,
  ...keys: string[]
): bigint | undefined {
  if (!cost || typeof cost !== "object") return undefined;
  const record = cost as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return toBigInt(value);
  }
  return undefined;
}

export function scVecAddress(addrs: string[]): xdr.ScVal {
  return xdr.ScVal.scvVec(
    addrs.map((a) => nativeToScVal(a, { type: "address" })),
  );
}

export function scVecSymbol(syms: string[]): xdr.ScVal {
  return xdr.ScVal.scvVec(
    syms.map((s) => nativeToScVal(s.trim(), { type: "symbol" })),
  );
}

export function scVecBytes(blobs: (Buffer | Uint8Array)[]): xdr.ScVal {
  return xdr.ScVal.scvVec(
    blobs.map((b) => nativeToScVal(b, { type: "bytes" })),
  );
}

/**
 * GovernorClient — interact with a deployed NebGov governor contract.
 *
 * TODO issue #14: add full error handling, retry logic, and simulation flow.
 */
export class GovernorClient {
  readonly config: GovernorConfig;
  readonly server: SorobanRpc.Server;
  readonly contract: Contract;
  readonly networkPassphrase: string;

  constructor(config: GovernorConfig) {
    this.config = config;
    const rpcUrl = config.rpcUrl ?? RPC_URLS[config.network];
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    this.contract = new Contract(config.governorAddress);
    this.networkPassphrase = NETWORK_PASSPHRASES[config.network];
  }

  async retry<T>(
    fn: () => Promise<T>,
    retryOn?: (e: unknown) => boolean,
  ): Promise<T> {
    return withRetry(fn, {
      maxAttempts: this.config.maxAttempts ?? 3,
      baseDelayMs: this.config.baseDelayMs ?? 1000,
      retryOn,
      onRetry: (attempt, error) => {
        console.debug(`[GovernorClient] Retry attempt ${attempt} due to error:`, error);
      },
    });
  }

  isNetworkError(e: unknown): boolean {
    if (e instanceof Error) {
      const msg = e.message.toLowerCase();
      if (
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("aborted") ||
        msg.includes("connection refused") ||
        msg.includes("econnrefused") ||
        msg.includes("500") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("504")
      ) {
        return true;
      }
    }
    return false;
  }

  isRetryableSubmissionError(e: unknown): boolean {
    if (this.isNetworkError(e)) return true;

    // Do not retry on contract errors (parsed as GovernorError with code < 100)
    if (e instanceof GovernorError && e.code < 100) {
      return false;
    }

    // Do not retry if already in mempool (idempotency check)
    if (e instanceof Error && e.message.includes("TransactionAlreadyInMempool")) {
      return false;
    }

    return false;
  }

  readAccount(sourceAccount?: string): string {
    return (
      sourceAccount ??
      this.config.simulationAccount ??
      this.config.governorAddress
    );
  }

  async pollForConfirmation(
    hash: string,
    retries = 10,
    delayMs = 2000,
  ): Promise<SorobanRpc.Api.GetSuccessfulTransactionResponse> {
    for (let i = 0; i < retries; i++) {
      await new Promise((r) => setTimeout(r, delayMs));
      const status = await this.server.getTransaction(hash);
      if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        return status as SorobanRpc.Api.GetSuccessfulTransactionResponse;
      }
      if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction failed: ${hash}`);
      }
    }
    throw new Error(`Transaction not confirmed after ${retries} retries`);
  }

  async execute(signer: Keypair, proposalId: bigint): Promise<void> {
    return this.retry(async () => {
      const account = await this.server.getAccount(signer.publicKey());
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          this.contract.call("execute", nativeToScVal(proposalId, { type: "u64" })),
        )
        .setTimeout(30)
        .build();

      const simResult = await this.server.simulateTransaction(tx);
      if (SorobanRpc.Api.isSimulationError(simResult)) {
        const errStr = (simResult as SorobanRpc.Api.SimulateTransactionErrorResponse).error ?? "";
        throw parseGovernorError(errStr);
      }

      const assembled = SorobanRpc.assembleTransaction(
        tx,
        simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse,
      ).build();
      assembled.sign(signer);

      const result = await this.server.sendTransaction(assembled);
      if (result.status === "ERROR") {
        throw parseGovernorError((result as unknown as { error?: string }).error ?? "");
      }
      await this.pollForConfirmation(result.hash);
    }, (e) => this.isRetryableSubmissionError(e));
  }

  async listProposals(from: number, count: number): Promise<Proposal[]> {
    const account = await this.server.getAccount(this.readAccount());

    const listTx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          "get_proposal_list",
          nativeToScVal(from, { type: "u32" }),
          nativeToScVal(count, { type: "u32" }),
        ),
      )
      .setTimeout(30)
      .build();

    const listResult = await this.server.simulateTransaction(listTx);
    if (!SorobanRpc.Api.isSimulationError(listResult)) {
      const raw = (listResult as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
      return raw ? (scValToNative(raw) as Proposal[]) : [];
    }

    // Fallback: fetch proposal_count then individual proposals
    const countTx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call("proposal_count"))
      .setTimeout(30)
      .build();

    const countResult = await this.server.simulateTransaction(countTx);
    if (SorobanRpc.Api.isSimulationError(countResult)) return [];

    const countRaw = (countResult as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    const total = countRaw ? Number(scValToNative(countRaw)) : 0;

    const proposals: Proposal[] = [];
    for (let i = from + 1; i <= Math.min(from + count, total); i++) {
      const proposalTx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          this.contract.call("get_proposal", nativeToScVal(BigInt(i), { type: "u64" })),
        )
        .setTimeout(30)
        .build();

      const proposalResult = await this.server.simulateTransaction(proposalTx);
      if (SorobanRpc.Api.isSimulationError(proposalResult)) continue;

      const proposalRaw = (proposalResult as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
      if (proposalRaw) {
        proposals.push(scValToNative(proposalRaw) as Proposal);
      }
    }
    return proposals;
  }

  /**
   * Queue a succeeded proposal in the Timelock, starting its execution delay.
   *
   * The proposal must be in the Succeeded state. After queuing, it enters
   * the Queued state and can be executed once the delay has elapsed.
   *
   * @param signer     Keypair authorising the call
   * @param proposalId The ID of the proposal to queue
   */
  async queue(signer: Keypair, proposalId: bigint): Promise<void> {
    return this.retry(async () => {
      const account = await this.server.getAccount(signer.publicKey());

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          this.contract.call("queue", nativeToScVal(proposalId, { type: "u64" })),
        )
        .setTimeout(30)
        .build();

      const prepared = await this.server.prepareTransaction(tx);
      prepared.sign(signer);

      const result = await this.server.sendTransaction(prepared);
      if (result.status === "ERROR") {
        throw new GovernorError(
          GovernorErrorCode.TransactionFailed,
          `queue failed: ${JSON.stringify(result)}`,
        );
      }

      await this.pollForConfirmation(result.hash);
    }, (e) => this.isRetryableSubmissionError(e));
  }

  // ─── Delegating wrappers ────────────────────────────────────────────────
  //
  // The methods below restore the object-oriented call surface
  // (`client.propose(...)`) on top of the modular free functions introduced
  // when this class was split into governor/{proposals,voting,queries,
  // execution,events}.ts. Each free function already takes `client` as its
  // first argument, so these are pure 1:1 delegation — no behavior changes.

  propose(...args: TailArgs<typeof proposalsModule.propose>) {
    return proposalsModule.propose(this, ...args);
  }

  proposeWithSign(...args: TailArgs<typeof proposalsModule.proposeWithSign>) {
    return proposalsModule.proposeWithSign(this, ...args);
  }

  simulateTargetInvocation(...args: TailArgs<typeof proposalsModule.simulateTargetInvocation>) {
    return proposalsModule.simulateTargetInvocation(this, ...args);
  }

  simulateProposal(...args: TailArgs<typeof proposalsModule.simulateProposal>) {
    return proposalsModule.simulateProposal(this, ...args);
  }

  estimateProposeResources(...args: TailArgs<typeof proposalsModule.estimateProposeResources>) {
    return proposalsModule.estimateProposeResources(this, ...args);
  }

  cancel(...args: TailArgs<typeof proposalsModule.cancel>) {
    return proposalsModule.cancel(this, ...args);
  }

  cancelByGovernance(...args: TailArgs<typeof proposalsModule.cancelByGovernance>) {
    return proposalsModule.cancelByGovernance(this, ...args);
  }

  cancelByGovernanceWithSign(...args: TailArgs<typeof proposalsModule.cancelByGovernanceWithSign>) {
    return proposalsModule.cancelByGovernanceWithSign(this, ...args);
  }

  waitForProposalState(...args: TailArgs<typeof proposalsModule.waitForProposalState>) {
    return proposalsModule.waitForProposalState(this, ...args);
  }

  getProposal(...args: TailArgs<typeof proposalsModule.getProposal>) {
    return proposalsModule.getProposal(this, ...args);
  }

  getQueueTime(...args: TailArgs<typeof proposalsModule.getQueueTime>) {
    return proposalsModule.getQueueTime(this, ...args);
  }

  getQueuedOpIds(...args: TailArgs<typeof proposalsModule.getQueuedOpIds>) {
    return proposalsModule.getQueuedOpIds(this, ...args);
  }

  getTimelockInfo(...args: TailArgs<typeof proposalsModule.getTimelockInfo>): Promise<TimelockInfo> {
    return proposalsModule.getTimelockInfo(this, ...args);
  }

  getProposalsBatch(...args: TailArgs<typeof proposalsModule.getProposalsBatch>) {
    return proposalsModule.getProposalsBatch(this, ...args);
  }

  getProposalExpiryLedger(...args: TailArgs<typeof proposalsModule.getProposalExpiryLedger>) {
    return proposalsModule.getProposalExpiryLedger(this, ...args);
  }

  buildUpdateConfigProposal(
    newSettings: GovernorSettings,
    limits?: GovernorSettingsValidationLimits,
  ) {
    return proposalsModule.buildUpdateConfigProposal(this, newSettings, limits);
  }

  estimateVoteGas(...args: TailArgs<typeof votingModule.estimateVoteGas>) {
    return votingModule.estimateVoteGas(this, ...args);
  }

  castVote(...args: TailArgs<typeof votingModule.castVote>) {
    return votingModule.castVote(this, ...args);
  }

  castVoteWithSign(...args: TailArgs<typeof votingModule.castVoteWithSign>) {
    return votingModule.castVoteWithSign(this, ...args);
  }

  castVoteWithReason(...args: TailArgs<typeof votingModule.castVoteWithReason>) {
    return votingModule.castVoteWithReason(this, ...args);
  }

  castVoteWithReasonAndSign(...args: TailArgs<typeof votingModule.castVoteWithReasonAndSign>) {
    return votingModule.castVoteWithReasonAndSign(this, ...args);
  }

  getProposalVotes(...args: TailArgs<typeof votingModule.getProposalVotes>): Promise<ProposalVotes> {
    return votingModule.getProposalVotes(this, ...args);
  }

  hasVoted(...args: TailArgs<typeof votingModule.hasVoted>) {
    return votingModule.hasVoted(this, ...args);
  }

  canPropose(...args: TailArgs<typeof votingModule.canPropose>): Promise<CanProposeResult> {
    return votingModule.canPropose(this, ...args);
  }

  getVotingHistory(...args: TailArgs<typeof votingModule.getVotingHistory>): Promise<VotingHistoryEntry[]> {
    return votingModule.getVotingHistory(this, ...args);
  }

  getVotesCastByAddress(...args: TailArgs<typeof votingModule.getVotesCastByAddress>) {
    return votingModule.getVotesCastByAddress(this, ...args);
  }

  getReceipt(...args: TailArgs<typeof votingModule.getReceipt>) {
    return votingModule.getReceipt(this, ...args);
  }

  getVoteReason(...args: TailArgs<typeof votingModule.getVoteReason>) {
    return votingModule.getVoteReason(this, ...args);
  }

  proposalThreshold(): Promise<bigint> {
    return queriesModule.proposalThreshold(this);
  }

  getSettings(...args: TailArgs<typeof queriesModule.getSettings>): Promise<GovernorSettings> {
    return queriesModule.getSettings(this, ...args);
  }

  getProposalState(...args: TailArgs<typeof queriesModule.getProposalState>): Promise<ProposalState> {
    return queriesModule.getProposalState(this, ...args);
  }

  getQuorum(...args: TailArgs<typeof queriesModule.getQuorum>): Promise<bigint> {
    return queriesModule.getQuorum(this, ...args);
  }

  isQuorumReached(...args: TailArgs<typeof queriesModule.isQuorumReached>): Promise<boolean> {
    return queriesModule.isQuorumReached(this, ...args);
  }

  getLatestLedger(): Promise<number> {
    return queriesModule.getLatestLedger(this);
  }

  onProposalStateChange(...args: TailArgs<typeof queriesModule.onProposalStateChange>): () => void {
    return queriesModule.onProposalStateChange(this, ...args);
  }

  proposalCount(): Promise<bigint> {
    return queriesModule.proposalCount(this);
  }

  getProposalFromIndexer(...args: TailArgs<typeof queriesModule.getProposalFromIndexer>) {
    return queriesModule.getProposalFromIndexer(this, ...args);
  }

  getLastProposalLedger(...args: TailArgs<typeof queriesModule.getLastProposalLedger>): Promise<number> {
    return queriesModule.getLastProposalLedger(this, ...args);
  }

  getProposalsInPeriod(...args: TailArgs<typeof queriesModule.getProposalsInPeriod>): Promise<number> {
    return queriesModule.getProposalsInPeriod(this, ...args);
  }

  getProposalsSummaryBatch(...args: TailArgs<typeof queriesModule.getProposalsSummaryBatch>) {
    return queriesModule.getProposalsSummaryBatch(this, ...args);
  }

  estimateExecutionGas(...args: TailArgs<typeof executionModule.estimateExecutionGas>): Promise<ExecutionGasEstimate> {
    return executionModule.estimateExecutionGas(this, ...args);
  }

  getGuardianActivity(...args: TailArgs<typeof eventsModule.getGuardianActivity>) {
    return eventsModule.getGuardianActivity(this, ...args);
  }

  getProposalsForAddress(...args: TailArgs<typeof eventsModule.getProposalsForAddress>) {
    return eventsModule.getProposalsForAddress(this, ...args);
  }
}

/** Parameters of a `(client: GovernorClient, ...rest)` free function, minus `client`. */
type TailArgs<F> = F extends (client: GovernorClient, ...rest: infer R) => unknown ? R : never;
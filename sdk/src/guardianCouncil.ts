import {
  BASE_FEE,
  Contract,
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import type { Network } from "./types";
import { getRpcUrl, getNetworkPassphrase } from "./network";

export interface GuardianCouncilConfig {
  guardianCouncilAddress: string;
  network: Network;
  rpcUrl?: string;
  /** Funded public account used for read-only simulations. */
  simulationAccount?: string;
}

/** Council actions mirror the contract enum; IDs retain full u64 precision. */
export type GuardianAction =
  | { tag: "Pause" | "Unpause" }
  | { tag: "CancelActive" | "CancelQueued"; proposalId: bigint }
  | { tag: "RotateMember"; old: string; new: string }
  | { tag: "SetThreshold"; threshold: number };

export interface PendingAction {
  id: bigint;
  action: GuardianAction;
  proposer: string;
  createdLedger: number;
  approvals: string[];
  executed: boolean;
}

/** Encode the Soroban enum as a symbol-led vector, including typed payloads. */
export function encodeGuardianAction(action: GuardianAction): xdr.ScVal {
  const values = [nativeToScVal(action.tag, { type: "symbol" })];
  switch (action.tag) {
    case "CancelActive":
    case "CancelQueued":
      values.push(nativeToScVal(action.proposalId, { type: "u64" }));
      break;
    case "SetThreshold":
      values.push(nativeToScVal(action.threshold, { type: "u32" }));
      break;
    case "RotateMember":
      values.push(
        xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: nativeToScVal("new", { type: "symbol" }),
            val: nativeToScVal(action.new, { type: "address" }),
          }),
          new xdr.ScMapEntry({
            key: nativeToScVal("old", { type: "symbol" }),
            val: nativeToScVal(action.old, { type: "address" }),
          }),
        ]),
      );
      break;
  }
  return xdr.ScVal.scvVec(values);
}

/** Decode the native vector returned by scValToNative for a contract enum. */
export function decodeGuardianAction(raw: unknown): GuardianAction {
  if (!Array.isArray(raw)) throw new Error("Invalid GuardianAction");
  const [tag, value] = raw;
  switch (tag) {
    case "Pause":
    case "Unpause":
      return { tag };
    case "CancelActive":
    case "CancelQueued":
      return { tag, proposalId: BigInt(value) };
    case "SetThreshold":
      return { tag, threshold: Number(value) };
    case "RotateMember":
      return { tag, old: String(value.old), new: String(value.new) };
    default:
      throw new Error(`Unknown GuardianAction: ${String(tag)}`);
  }
}

/** Keypair-based transactions and read-only RPC views for the guardian council. */
export class GuardianCouncilClient {
  private readonly server: SorobanRpc.Server;
  private readonly contract: Contract;
  private readonly passphrase: string;

  constructor(private readonly config: GuardianCouncilConfig) {
    this.server = new SorobanRpc.Server(
      getRpcUrl(config.network, config.rpcUrl),
    );
    this.contract = new Contract(config.guardianCouncilAddress);
    this.passphrase = getNetworkPassphrase(config.network);
  }

  /** Initialize once; signer pays fees and is not an on-chain argument. */
  async initialize(
    signer: Keypair,
    members: string[],
    threshold: number,
    governor: string,
    actionTtlLedgers: number,
  ): Promise<string> {
    return (
      await this.submit(
        signer,
        "initialize",
        xdr.ScVal.scvVec(
          members.map((member) => nativeToScVal(member, { type: "address" })),
        ),
        nativeToScVal(threshold, { type: "u32" }),
        nativeToScVal(governor, { type: "address" }),
        nativeToScVal(actionTtlLedgers, { type: "u32" }),
      )
    ).hash;
  }

  /** Proposing automatically records the proposer's first approval. */
  async proposeAction(
    proposer: Keypair,
    action: GuardianAction,
  ): Promise<bigint> {
    const result = await this.submit(
      proposer,
      "propose_action",
      nativeToScVal(proposer.publicKey(), { type: "address" }),
      encodeGuardianAction(action),
    );
    if (!result.returnValue)
      throw new Error("Missing action ID in transaction result");
    return BigInt(scValToNative(result.returnValue));
  }

  /** Add a member's approval. */
  async approveAction(member: Keypair, actionId: bigint): Promise<string> {
    return (
      await this.submit(
        member,
        "approve_action",
        nativeToScVal(member.publicKey(), { type: "address" }),
        nativeToScVal(actionId, { type: "u64" }),
      )
    ).hash;
  }

  /** Withdraw the signer's approval. */
  async revokeApproval(member: Keypair, actionId: bigint): Promise<string> {
    return (
      await this.submit(
        member,
        "revoke_approval",
        nativeToScVal(member.publicKey(), { type: "address" }),
        nativeToScVal(actionId, { type: "u64" }),
      )
    ).hash;
  }

  /** Permissionless after the approval threshold is met; caller pays fees. */
  async executeAction(caller: Keypair, actionId: bigint): Promise<string> {
    return (
      await this.submit(
        caller,
        "execute_action",
        nativeToScVal(actionId, { type: "u64" }),
      )
    ).hash;
  }

  /** Read an action, including its approvals and execution status. */
  async getAction(actionId: bigint): Promise<PendingAction> {
    const raw = (await this.simulate(
      "get_action",
      nativeToScVal(actionId, { type: "u64" }),
    )) as Record<string, unknown>;
    return {
      id: BigInt(String(raw.id)),
      action: decodeGuardianAction(raw.action),
      proposer: String(raw.proposer),
      createdLedger: Number(raw.created_ledger),
      approvals: raw.approvals as string[],
      executed: Boolean(raw.executed),
    };
  }

  /** List current council members. */
  async getMembers(): Promise<string[]> {
    return (await this.simulate("get_members")) as string[];
  }
  /** Read the current approval threshold. */
  async getThreshold(): Promise<number> {
    return Number(await this.simulate("get_threshold"));
  }
  /** Read the governor protected by this council. */
  async getGovernor(): Promise<string> {
    return String(await this.simulate("get_governor"));
  }

  private async submit(signer: Keypair, fn: string, ...args: xdr.ScVal[]) {
    const account = await this.server.getAccount(signer.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.passphrase,
    })
      .addOperation(this.contract.call(fn, ...args))
      .setTimeout(30)
      .build();
    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(signer);
    const sent = await this.server.sendTransaction(prepared);
    if (sent.status === "ERROR")
      throw new Error(
        `Guardian council transaction rejected: ${JSON.stringify(sent)}`,
      );
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const result = await this.server.getTransaction(sent.hash);
      if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS)
        return { ...result, hash: sent.hash };
      if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED)
        throw new Error(`Guardian council transaction failed: ${sent.hash}`);
    }
    throw new Error(
      `Guardian council transaction confirmation timed out: ${sent.hash}`,
    );
  }

  private async simulate(fn: string, ...args: xdr.ScVal[]): Promise<unknown> {
    if (!this.config.simulationAccount)
      throw new Error(
        "simulationAccount is required for guardian council views",
      );
    const account = await this.server.getAccount(this.config.simulationAccount);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.passphrase,
    })
      .addOperation(this.contract.call(fn, ...args))
      .setTimeout(30)
      .build();
    const result = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(result))
      throw new Error(`Guardian council simulation failed: ${result.error}`);
    if (!result.result?.retval)
      throw new Error("Guardian council simulation returned no value");
    return scValToNative(result.result.retval);
  }
}

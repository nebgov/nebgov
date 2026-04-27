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
import { GovernorConfig, DelegateInfo, Network } from "./types";

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

/**
 * VotesClient — interact with the token-votes contract.
 * Handles delegation and voting power queries.
 *
 * TODO issue #32: add event subscription for DelegateChanged events.
 */
export class VotesClient {
  private readonly server: SorobanRpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;

  constructor(config: GovernorConfig) {
    const rpcUrl = config.rpcUrl ?? RPC_URLS[config.network];
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    this.contract = new Contract(config.votesAddress);
    this.networkPassphrase = NETWORK_PASSPHRASES[config.network];
  }

  /**
   * Delegate voting power to another address (or self-delegate to activate votes).
   *
   * @returns The Stellar transaction hash, suitable for linking to a block explorer.
   */
  async delegate(signer: Keypair, delegatee: string): Promise<string> {
    const account = await this.server.getAccount(signer.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          "delegate",
          nativeToScVal(signer.publicKey(), { type: "address" }),
          nativeToScVal(delegatee, { type: "address" })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(signer);
    const result = await this.server.sendTransaction(prepared);
    if (result.status === "ERROR") {
      throw new Error(`delegate failed: ${JSON.stringify(result)}`);
    }
    return result.hash;
  }

  /**
   * Revoke delegation and move voting power back to self.
   *
   * @returns The Stellar transaction hash, suitable for linking to a block explorer.
   */
  async undelegate(signer: Keypair): Promise<string> {
    return this.delegate(signer, signer.publicKey());
  }

  /**
   * Get current voting power of an address.
   */
  async getVotes(account: string): Promise<bigint> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        await this.server.getAccount(account),
        { fee: BASE_FEE, networkPassphrase: this.networkPassphrase }
      )
        .addOperation(
          this.contract.call(
            "get_votes",
            nativeToScVal(account, { type: "address" })
          )
        )
        .setTimeout(30)
        .build()
    );

    if (SorobanRpc.Api.isSimulationError(result)) return 0n;
    const raw = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
      .result?.retval;
    return raw ? BigInt(scValToNative(raw)) : 0n;
  }

  /**
   * Get voting power at a past ledger sequence.
   * TODO issue #9 (contract): requires checkpoint binary search to be implemented first.
   */
  async getPastVotes(account: string, ledger: number): Promise<bigint> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        await this.server.getAccount(account),
        { fee: BASE_FEE, networkPassphrase: this.networkPassphrase }
      )
        .addOperation(
          this.contract.call(
            "get_past_votes",
            nativeToScVal(account, { type: "address" }),
            nativeToScVal(ledger, { type: "u32" })
          )
        )
        .setTimeout(30)
        .build()
    );

    if (SorobanRpc.Api.isSimulationError(result)) return 0n;
    const raw = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
      .result?.retval;
    return raw ? BigInt(scValToNative(raw)) : 0n;
  }

  /**
   * Get current delegatee of an account.
   */
  async getDelegatee(account: string): Promise<string | null> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        await this.server.getAccount(account),
        { fee: BASE_FEE, networkPassphrase: this.networkPassphrase }
      )
        .addOperation(
          this.contract.call(
            "delegates",
            nativeToScVal(account, { type: "address" })
          )
        )
        .setTimeout(30)
        .build()
    );

    if (SorobanRpc.Api.isSimulationError(result)) return null;
    const raw = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
      .result?.retval;
    return raw ? (scValToNative(raw) as string) : null;
  }

  /**
   * Get total supply of the voting token.
   */
  async getTotalSupply(): Promise<bigint> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        await this.server.getAccount(this.contract.contractId()),
        { fee: BASE_FEE, networkPassphrase: this.networkPassphrase }
      )
        .addOperation(this.contract.call("total_supply"))
        .setTimeout(30)
        .build()
    );

    if (SorobanRpc.Api.isSimulationError(result)) return 0n;
    const raw = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
      .result?.retval;
    return raw ? BigInt(scValToNative(raw)) : 0n;
  }

  /**
   * Get top delegates by voting power.
   *
   * Note: This queries known delegate addresses. In production, this would
   * use an indexer or event subscription to track DelegateChanged events.
   */
  async getTopDelegates(addresses: string[], limit = 20): Promise<DelegateInfo[]> {
    const totalSupply = await this.getTotalSupply();
    if (totalSupply === 0n) return [];

    const delegatePromises = addresses.map(async (address) => {
      const votes = await this.getVotes(address);
      return {
        address,
        votes,
        percentOfSupply: totalSupply > 0n
          ? Number((votes * 10000n) / totalSupply) / 100
          : 0,
      };
    });

    const delegates = await Promise.all(delegatePromises);
    return delegates
      .filter((d) => d.votes > 0n)
      .sort((a, b) => (b.votes > a.votes ? 1 : b.votes < a.votes ? -1 : 0))
      .slice(0, limit);
  }
}

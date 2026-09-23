import type { GovernorConfig, Network } from "@nebgov/sdk";
import { backendBaseUrl } from "./backend";

const VALID_NETWORKS: readonly Network[] = ["mainnet", "testnet", "futurenet"];

/**
 * Parses and validates a Stellar network name from env, throwing a clear
 * error on an unknown value instead of silently type-checking it away.
 */
export function parseNetwork(value: string | undefined): Network {
  const network = value || "testnet";
  if (!VALID_NETWORKS.includes(network as Network)) {
    throw new Error(
      `Invalid NEXT_PUBLIC_NETWORK "${network}": expected one of ${VALID_NETWORKS.join(", ")}`
    );
  }
  return network as Network;
}

/** Governor client config from Next public env (or null if misconfigured). */
export function readGovernorConfig(): GovernorConfig | null {
  const governorAddress = process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS;
  const timelockAddress = process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS;
  const votesAddress = process.env.NEXT_PUBLIC_VOTES_ADDRESS;
  const coSponsorshipAddress = process.env.NEXT_PUBLIC_CO_SPONSORSHIP_ADDRESS;
  const convictionVotingAddress = process.env.NEXT_PUBLIC_CONVICTION_VOTING_ADDRESS;
  const signalAnchorAddress = process.env.NEXT_PUBLIC_SIGNAL_ANCHOR_ADDRESS;
  const proposalBondsAddress = process.env.NEXT_PUBLIC_PROPOSAL_BONDS_ADDRESS;
  const treasuryStrategiesAddress = process.env.NEXT_PUBLIC_TREASURY_STRATEGIES_ADDRESS;
  const optimisticGovernorAddress = process.env.NEXT_PUBLIC_OPTIMISTIC_GOVERNOR_ADDRESS;
  const votingRewardsAddress = process.env.NEXT_PUBLIC_VOTING_REWARDS_ADDRESS;
  const network = parseNetwork(process.env.NEXT_PUBLIC_NETWORK);
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

  if (!governorAddress || !timelockAddress || !votesAddress) return null;

  return {
    governorAddress,
    timelockAddress,
    votesAddress,
    network,
    backendUrl: backendBaseUrl(),
    ...(rpcUrl ? { rpcUrl } : {}),
    ...(coSponsorshipAddress ? { coSponsorshipAddress } : {}),
    ...(convictionVotingAddress ? { convictionVotingAddress } : {}),
    ...(signalAnchorAddress ? { signalAnchorAddress } : {}),
    ...(proposalBondsAddress ? { proposalBondsAddress } : {}),
    ...(treasuryStrategiesAddress ? { treasuryStrategiesAddress } : {}),
    ...(optimisticGovernorAddress ? { optimisticGovernorAddress } : {}),
    ...(votingRewardsAddress ? { votingRewardsAddress } : {}),
  };
}

export function subscriptionOptsFromConfig(config: GovernorConfig): {
  network: Network;
  rpcUrl?: string;
} {
  return { network: config.network, ...(config.rpcUrl ? { rpcUrl: config.rpcUrl } : {}) };
}

/** Returns the indexer base URL or null if not configured. */
export function readIndexerUrl(): string | null {
  return process.env.NEXT_PUBLIC_INDEXER_URL ?? null;
}

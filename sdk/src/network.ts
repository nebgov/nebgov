/**
 * Network configuration and validation utilities.
 * 
 * Provides centralized RPC URLs, network passphrases, and validation
 * for Stellar networks to ensure consistency across all SDK clients.
 */

import { Networks } from "@stellar/stellar-sdk";
import type { Network } from "./types";

/** RPC URLs for each supported Stellar network. */
export const RPC_URLS: Record<Network, string> = {
  mainnet: "https://soroban-rpc.mainnet.stellar.gateway.fm",
  testnet: "https://soroban-testnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
};

/** Network passphrases for each supported Stellar network. */
export const NETWORK_PASSPHRASES: Record<Network, string> = {
  mainnet: Networks.PUBLIC,
  testnet: Networks.TESTNET,
  futurenet: Networks.FUTURENET,
};

/**
 * Validates that a network name is recognized and returns it as a typed Network.
 * 
 * @param network - The network name to validate
 * @returns The validated network
 * @throws Error if the network is not recognized
 * 
 * @example
 * validateNetwork("testnet"); // returns "testnet"
 * validateNetwork("unknown"); // throws Error: Unknown network: unknown. Supported networks: mainnet, testnet, futurenet
 */
export function validateNetwork(network: string): Network {
  const validNetworks: Network[] = ["mainnet", "testnet", "futurenet"];
  
  if (!validNetworks.includes(network as Network)) {
    throw new Error(
      `Unknown network: ${network}. Supported networks: ${validNetworks.join(", ")}`
    );
  }
  
  return network as Network;
}

/**
 * Gets the RPC URL for a given network, with validation.
 * 
 * @param network - The network name
 * @param rpcUrlOverride - Optional custom RPC URL that takes precedence
 * @returns The RPC URL to use
 * @throws Error if the network is not recognized
 */
export function getRpcUrl(network: string, rpcUrlOverride?: string): string {
  const validatedNetwork = validateNetwork(network);
  return rpcUrlOverride ?? RPC_URLS[validatedNetwork];
}

/**
 * Gets the network passphrase for a given network, with validation.
 * 
 * @param network - The network name
 * @returns The network passphrase
 * @throws Error if the network is not recognized
 */
export function getNetworkPassphrase(network: string): string {
  const validatedNetwork = validateNetwork(network);
  return NETWORK_PASSPHRASES[validatedNetwork];
}

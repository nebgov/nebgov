import type { Network } from "@nebgov/sdk";
import { Keypair } from "@stellar/stellar-sdk";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type NebGovCliConfig = {
  network: Network;
  rpcUrl?: string;
  governorAddress?: string;
  timelockAddress?: string;
  votesAddress?: string;
  treasuryAddress?: string;
  factoryAddress?: string;
  proposalBondsAddress?: string;
  convictionVotingAddress?: string;
  optimisticGovernorAddress?: string;
  treasuryStrategiesAddress?: string;
  indexerUrl?: string;
  backendUrl?: string;
  keypairFile?: string;
  defaultAccount?: string;
};

/** Environment variable backing each config field. */
export const CONFIG_ENV: Record<keyof NebGovCliConfig, string> = {
  network: "NEBGOV_NETWORK",
  rpcUrl: "NEBGOV_RPC_URL",
  governorAddress: "NEBGOV_GOVERNOR_ADDRESS",
  timelockAddress: "NEBGOV_TIMELOCK_ADDRESS",
  votesAddress: "NEBGOV_VOTES_ADDRESS",
  treasuryAddress: "NEBGOV_TREASURY_ADDRESS",
  factoryAddress: "NEBGOV_FACTORY_ADDRESS",
  proposalBondsAddress: "NEBGOV_PROPOSAL_BONDS_ADDRESS",
  convictionVotingAddress: "NEBGOV_CONVICTION_VOTING_ADDRESS",
  optimisticGovernorAddress: "NEBGOV_OPTIMISTIC_GOVERNOR_ADDRESS",
  treasuryStrategiesAddress: "NEBGOV_TREASURY_STRATEGIES_ADDRESS",
  indexerUrl: "NEBGOV_INDEXER_URL",
  backendUrl: "NEBGOV_BACKEND_URL",
  keypairFile: "NEBGOV_KEYPAIR_FILE",
  defaultAccount: "NEBGOV_DEFAULT_ACCOUNT",
};

const NETWORKS: readonly Network[] = ["mainnet", "testnet", "futurenet"];

export function resolvePath(rawPath: string): string {
  if (rawPath.startsWith("~/")) {
    return path.join(homedir(), rawPath.slice(2));
  }
  return rawPath;
}

export async function loadConfig(configPathArg?: string): Promise<NebGovCliConfig> {
  const defaultPath = path.join(homedir(), ".nebgov", "config.json");
  const configPath = resolvePath(configPathArg ?? process.env.NEBGOV_CONFIG ?? defaultPath);

  let fromFile: Partial<NebGovCliConfig> = {};
  try {
    const raw = await readFile(configPath, "utf8");
    fromFile = JSON.parse(raw) as Partial<NebGovCliConfig>;
  } catch {
    // optional config file
  }

  const fromEnv: Partial<Record<keyof NebGovCliConfig, string>> = {};
  for (const [field, envVar] of Object.entries(CONFIG_ENV) as Array<[keyof NebGovCliConfig, string]>) {
    const value = process.env[envVar];
    if (value !== undefined) fromEnv[field] = value;
  }

  const cfg = {
    network: "testnet",
    ...fromFile,
    ...fromEnv,
  } as NebGovCliConfig;

  if (!NETWORKS.includes(cfg.network)) {
    throw new Error(`network must be one of: ${NETWORKS.join(", ")} (got "${cfg.network}")`);
  }
  return cfg;
}

export function required<K extends keyof NebGovCliConfig>(
  cfg: NebGovCliConfig,
  field: K,
): NonNullable<NebGovCliConfig[K]> {
  const value = cfg[field];
  if (!value) {
    throw new Error(
      `Missing required config: ${field} (set ${CONFIG_ENV[field]} or add "${field}" to the config file)`,
    );
  }
  return value as NonNullable<NebGovCliConfig[K]>;
}

/**
 * Load a signing keypair from a file holding either a raw `S...` secret or a
 * JSON object / string with the secret under `secret`, `secretKey` or `privateKey`.
 */
export async function loadKeypair(rawPath: string): Promise<Keypair> {
  const filePath = resolvePath(rawPath);
  const raw = (await readFile(filePath, "utf8")).trim();

  let secret: string | undefined = raw;
  try {
    const parsed = JSON.parse(raw) as
      | { secret?: string; secretKey?: string; privateKey?: string }
      | string;
    secret = typeof parsed === "string" ? parsed : parsed.secret ?? parsed.secretKey ?? parsed.privateKey;
  } catch {
    // not JSON: the file holds the raw secret
  }

  try {
    return Keypair.fromSecret(secret ?? "");
  } catch {
    throw new Error(`No valid Stellar secret key found in keypair file ${filePath}`);
  }
}

import { Command } from "commander";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CONFIG_ENV, type NebGovCliConfig } from "../config";
import { createProgram } from "../program";

/** Deterministic fixtures so assertions can pin exact addresses. */
export const SIGNER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));
export const ACCOUNT = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
export const OTHER_ACCOUNT = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
export const contractAddress = (seed: number): string => StrKey.encodeContract(Buffer.alloc(32, seed));

export const GOVERNOR = contractAddress(10);
export const TIMELOCK = contractAddress(11);
export const VOTES = contractAddress(12);
export const TREASURY = contractAddress(13);
export const FACTORY = contractAddress(14);
export const TOKEN = contractAddress(15);

export const BASE_CONFIG: NebGovCliConfig = {
  network: "testnet",
  governorAddress: GOVERNOR,
  timelockAddress: TIMELOCK,
  votesAddress: VOTES,
  treasuryAddress: TREASURY,
  factoryAddress: FACTORY,
};

let tempDir: string | undefined;

export function writeTemp(name: string, content: string): string {
  tempDir ??= mkdtempSync(path.join(tmpdir(), "nebgov-cli-test-"));
  const file = path.join(tempDir, name);
  writeFileSync(file, content);
  return file;
}

export function writeKeypairFile(keypair: Keypair = SIGNER): string {
  return writeTemp(`keypair-${keypair.publicKey().slice(0, 8)}.json`, JSON.stringify({ secret: keypair.secret() }));
}

const savedEnv: Record<string, string | undefined> = {};

/** Isolate each test from the developer's NEBGOV_* environment and temp files. */
export function useCleanEnvironment(): void {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const envVar of [...Object.values(CONFIG_ENV), "NEBGOV_CONFIG"]) {
      savedEnv[envVar] = process.env[envVar];
      delete process.env[envVar];
    }
  });

  afterEach(() => {
    for (const [envVar, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[envVar];
      else process.env[envVar] = value;
    }
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });
}

function silence(command: Command): void {
  command.exitOverride().configureOutput({ writeOut: () => undefined, writeErr: () => undefined });
  command.commands.forEach(silence);
}

export type CliResult = { stdout: string; json: <T = any>() => T };

/**
 * Run the CLI in-process against `config` (written to a temp config file).
 * Commander usage errors and action errors reject instead of exiting.
 */
export async function runCli(
  args: string[],
  config: Partial<NebGovCliConfig> | null = BASE_CONFIG,
): Promise<CliResult> {
  const lines: string[] = [];
  jest.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    lines.push(parts.map(String).join(" "));
  });
  jest.spyOn(console, "table").mockImplementation((data: unknown) => {
    lines.push(JSON.stringify(data));
  });

  const configArgs = config ? ["--config", writeTemp("config.json", JSON.stringify(config))] : [];
  const program = createProgram();
  silence(program);
  await program.parseAsync(["node", "nebgov", ...configArgs, ...args]);

  const stdout = lines.join("\n");
  return { stdout, json: () => JSON.parse(stdout) };
}

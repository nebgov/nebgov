#!/usr/bin/env node

import { Command } from "commander";
import {
  GovernorClient,
  VoteSupport,
  VotesClient,
  TreasuryClient,
  ProposalBondsClient,
  OptimisticGovernorClient,
  ConvictionVotingClient,
  TreasuryStrategiesClient,
  SignalingClient,
  CoSponsorshipClient,
  VoteEscrowClient,
  VotingRewardsClient,
  type Network,
} from "@nebgov/sdk";
import { Keypair } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

type NebGovCliConfig = {
  network: Network;
  rpcUrl?: string;
  governorAddress?: string;
  timelockAddress?: string;
  votesAddress?: string;
  treasuryAddress?: string;
  voteEscrowAddress?: string;
  votingRewardsAddress?: string;
  backendUrl?: string;
  keypairFile?: string;
  defaultAccount?: string;
};

type GlobalOptions = {
  human?: boolean;
  dryRun?: boolean;
  config?: string;
};

function output(value: unknown, opts: GlobalOptions): void {
  if (opts.human) {
    if (Array.isArray(value)) {
      console.table(value);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        console.log(`${key}: ${typeof val === "bigint" ? val.toString() : String(val)}`);
      }
      return;
    }
    console.log(String(value));
    return;
  }

  console.log(
    JSON.stringify(
      value,
      (_key, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
}

function resolvePath(rawPath: string): string {
  if (rawPath.startsWith("~/")) {
    return path.join(homedir(), rawPath.slice(2));
  }
  return rawPath;
}

async function loadConfig(configPathArg?: string): Promise<NebGovCliConfig> {
  const defaultPath = path.join(homedir(), ".nebgov", "config.json");
  const configPath = resolvePath(configPathArg ?? process.env.NEBGOV_CONFIG ?? defaultPath);

  let fromFile: Partial<NebGovCliConfig> = {};
  try {
    const raw = await readFile(configPath, "utf8");
    fromFile = JSON.parse(raw) as Partial<NebGovCliConfig>;
  } catch {
    // optional config file
  }

  const fromEnv: Partial<NebGovCliConfig> = {
    network: (process.env.NEBGOV_NETWORK as Network | undefined),
    rpcUrl: process.env.NEBGOV_RPC_URL,
    governorAddress: process.env.NEBGOV_GOVERNOR_ADDRESS,
    timelockAddress: process.env.NEBGOV_TIMELOCK_ADDRESS,
    votesAddress: process.env.NEBGOV_VOTES_ADDRESS,
    treasuryAddress: process.env.NEBGOV_TREASURY_ADDRESS,
    voteEscrowAddress: process.env.NEBGOV_VOTE_ESCROW_ADDRESS,
    votingRewardsAddress: process.env.NEBGOV_VOTING_REWARDS_ADDRESS,
    backendUrl: process.env.NEBGOV_BACKEND_URL,
    keypairFile: process.env.NEBGOV_KEYPAIR_FILE,
    defaultAccount: process.env.NEBGOV_DEFAULT_ACCOUNT,
  };

  return {
    network: "testnet",
    ...fromFile,
    ...Object.fromEntries(
      Object.entries(fromEnv).filter(([, val]) => val !== undefined),
    ),
  } as NebGovCliConfig;
}

function required(value: string | undefined, field: string): string {
  if (!value) {
    throw new Error(`Missing required config: ${field}`);
  }
  return value;
}

async function loadKeypair(rawPath: string): Promise<Keypair> {
  const filePath = resolvePath(rawPath);
  const raw = await readFile(filePath, "utf8");

  try {
    const parsed = JSON.parse(raw) as
      | { secret?: string; secretKey?: string; privateKey?: string }
      | string;

    if (typeof parsed === "string") return Keypair.fromSecret(parsed);
    const secret = parsed.secret ?? parsed.secretKey ?? parsed.privateKey;
    if (!secret) throw new Error("No secret key found in keypair file");
    return Keypair.fromSecret(secret);
  } catch {
    return Keypair.fromSecret(raw.trim());
  }
}

function getVoteSupport(input: string): VoteSupport {
  const normalized = input.toLowerCase();
  if (normalized === "for") return VoteSupport.For;
  if (normalized === "against") return VoteSupport.Against;
  if (normalized === "abstain") return VoteSupport.Abstain;
  throw new Error("support must be one of: for, against, abstain");
}

async function parseRecipientsCsv(filePathRaw: string): Promise<Array<{ address: string; amount: bigint }>> {
  const filePath = resolvePath(filePathRaw);
  const text = await readFile(filePath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const out: Array<{ address: string; amount: bigint }> = [];
  for (const line of lines) {
    const [address, amount] = line.split(",").map((part) => part.trim());
    if (!address || !amount) continue;
    out.push({ address, amount: BigInt(amount) });
  }
  return out;
}

const program = new Command();
program
  .name("nebgov")
  .description("NebGov terminal governance CLI")
  .option("--human", "human-readable output instead of JSON", false)
  .option("--dry-run", "simulate actions without submitting transactions", false)
  .option("--config <path>", "path to config file (defaults to ~/.nebgov/config.json)");

program
  .command("proposals")
  .description("Proposal commands")
  .addCommand(
    new Command("list")
      .option("--proposer <address>", "proposer address to list")
      .option("--limit <number>", "max proposals", "20")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const governor = new GovernorClient({
          network: cfg.network,
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const proposer =
          options.proposer ??
          cfg.defaultAccount ??
          (cfg.keypairFile ? (await loadKeypair(cfg.keypairFile)).publicKey() : undefined);

        if (!proposer) {
          throw new Error("Provide --proposer or set NEBGOV_DEFAULT_ACCOUNT / keypair");
        }

        const proposals = await governor.getProposalsForAddress(proposer, {
          limit: Number(options.limit),
        });
        output(
          proposals.map((entry: { id: bigint; proposal: { proposer: string; description: string }; state: unknown }) => ({
            id: entry.id,
            state: entry.state,
            proposer: entry.proposal.proposer,
            description: entry.proposal.description,
          })),
          global,
        );
      }),
  )
  .addCommand(
    new Command("get")
      .argument("<id>", "proposal id")
      .action(async (id: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const governor = new GovernorClient({
          network: cfg.network,
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const proposalId = BigInt(id);
        const [proposal, state, votes] = await Promise.all([
          governor.getProposal(proposalId),
          governor.getProposalState(proposalId),
          governor.getProposalVotes(proposalId),
        ]);
        output({ id: proposalId, state, proposal, votes }, global);
      }),
  )
  .addCommand(
    new Command("create")
      .requiredOption("--title <title>", "proposal title/summary")
      .requiredOption("--description-file <file>", "proposal description markdown/text file")
      .requiredOption("--target <address>", "target contract address")
      .requiredOption("--fn <name>", "target function name")
      .option("--calldata-hex <hex>", "hex calldata bytes (default empty)")
      .option("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const governor = new GovernorClient({
          network: cfg.network,
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const description = await readFile(resolvePath(options.descriptionFile), "utf8");
        const descriptionHash = createHash("sha256").update(description).digest("hex");
        const calldata = Buffer.from((options.calldataHex ?? "").replace(/^0x/i, ""), "hex");

        if (global.dryRun) {
          output(
            {
              action: "proposals.create",
              title: options.title,
              descriptionHash,
              target: options.target,
              fn: options.fn,
              calldataHex: calldata.toString("hex"),
            },
            global,
          );
          return;
        }

        const keypairPath = options.keypair ?? cfg.keypairFile;
        if (!keypairPath) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
        const signer = await loadKeypair(keypairPath);
        const proposalId = await governor.propose(
          signer,
          options.title,
          descriptionHash,
          "",
          [options.target],
          [options.fn],
          [calldata],
        );
        output({ proposalId }, global);
      }),
  );

program
  .command("vote")
  .description("Vote commands")
  .addCommand(
    new Command("cast")
      .argument("<proposalId>", "proposal id")
      .argument("<support>", "for|against|abstain")
      .requiredOption("--keypair <file>", "keypair file path")
      .action(async (proposalId: string, support: string, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const governor = new GovernorClient({
          network: cfg.network,
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const voteSupport = getVoteSupport(support);
        if (global.dryRun) {
          output({ action: "vote.cast", proposalId, support: voteSupport }, global);
          return;
        }

        const signer = await loadKeypair(options.keypair);
        await governor.castVote(signer, BigInt(proposalId), voteSupport);
        output({ ok: true, proposalId, support: voteSupport }, global);
      }),
  )
  .addCommand(
    new Command("status")
      .argument("<proposalId>", "proposal id")
      .option("--voter <address>", "voter address")
      .action(async (proposalId: string, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const governor = new GovernorClient({
          network: cfg.network,
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const voter =
          options.voter ??
          cfg.defaultAccount ??
          (cfg.keypairFile ? (await loadKeypair(cfg.keypairFile)).publicKey() : undefined);
        if (!voter) throw new Error("Provide --voter or set NEBGOV_DEFAULT_ACCOUNT / keypair");

        const receipt = await governor.hasVoted(BigInt(proposalId), voter);
        output({ proposalId, voter, receipt }, global);
      }),
  );

program
  .command("delegate")
  .description("Delegation commands")
  .addCommand(
    new Command("to")
      .argument("<address>", "delegatee address")
      .requiredOption("--keypair <file>", "keypair file path")
      .action(async (address: string, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const votes = new VotesClient({
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          network: cfg.network,
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        if (global.dryRun) {
          output({ action: "delegate.to", delegatee: address }, global);
          return;
        }

        const signer = await loadKeypair(options.keypair);
        await votes.delegate(signer, address);
        output({ ok: true, delegatee: address, delegator: signer.publicKey() }, global);
      }),
  )
  .addCommand(
    new Command("show")
      .argument("<address>", "delegator address")
      .action(async (address: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const votes = new VotesClient({
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          network: cfg.network,
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const [delegatee, votingPower] = await Promise.all([
          votes.getDelegatee(address),
          votes.getVotes(address),
        ]);
        output({ address, delegatee, votingPower }, global);
      }),
  );

program
  .command("treasury")
  .description("Treasury commands")
  .addCommand(
    new Command("balance")
      .option("--viewer <address>", "simulation viewer account")
      .option("--token <address>", "token address to inspect spending metrics")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const viewer =
          options.viewer ??
          cfg.defaultAccount ??
          (cfg.keypairFile ? (await loadKeypair(cfg.keypairFile)).publicKey() : undefined);
        if (!viewer) throw new Error("Provide --viewer or set NEBGOV_DEFAULT_ACCOUNT / keypair");

        const treasury = new TreasuryClient({
          network: cfg.network,
          treasuryAddress: required(cfg.treasuryAddress, "treasuryAddress"),
          rpcUrl: cfg.rpcUrl,
          simulationAccount: viewer,
        });

        const [owners, threshold, txCount] = await Promise.all([
          treasury.getOwners(),
          treasury.getThreshold(),
          treasury.getTxCount(),
        ]);

        let spentThisPeriod: bigint | null = null;
        if (options.token) {
          spentThisPeriod = await treasury.getSpentThisPeriod(options.token);
        }

        output(
          {
            viewer,
            owners,
            threshold,
            txCount,
            spentThisPeriod,
            token: options.token ?? null,
          },
          global,
        );
      }),
  )
  .addCommand(
    new Command("batch-transfer")
      .requiredOption("--token <address>", "token contract address")
      .requiredOption("--recipients <csv>", "CSV file containing address,amount rows")
      .requiredOption("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const treasury = new TreasuryClient({
          network: cfg.network,
          treasuryAddress: required(cfg.treasuryAddress, "treasuryAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const recipients = await parseRecipientsCsv(options.recipients);
        if (recipients.length === 0) {
          throw new Error("No recipients parsed from CSV");
        }

        if (global.dryRun) {
          output(
            {
              action: "treasury.batch-transfer",
              token: options.token,
              recipients,
              count: recipients.length,
            },
            global,
          );
          return;
        }

        const signer = await loadKeypair(options.keypair);
        const opHash = await treasury.batchTransfer(signer, options.token, recipients);
        output({ opHash, recipients: recipients.length }, global);
      }),
  );

program
  .command("proposal-bonds")
  .description("Proposal bonds commands")
  .addCommand(
    new Command("list")
      .option("--limit <number>", "max bonds", "20")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new ProposalBondsClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          proposalBondsAddress: process.env.NEBGOV_PROPOSAL_BONDS_ADDRESS || "",
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const bonds = await client.listBonds({
          limit: Number(options.limit),
        });
        output(bonds, global);
      }),
  )
  .addCommand(
    new Command("settings")
      .action(async () => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new ProposalBondsClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          proposalBondsAddress: process.env.NEBGOV_PROPOSAL_BONDS_ADDRESS || "",
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const settings = await client.getSettings();
        output(settings, global);
      }),
  );

program
  .command("conviction-voting")
  .description("Conviction voting commands")
  .addCommand(
    new Command("proposal")
      .argument("<id>", "proposal id")
      .action(async (id: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new ConvictionVotingClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          convictionVotingAddress: process.env.NEBGOV_CONVICTION_VOTING_ADDRESS || "",
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const proposal = await client.getProposal(Number(id));
        output(proposal, global);
      }),
  )
  .addCommand(
    new Command("history")
      .argument("<id>", "proposal id")
      .action(async (id: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new ConvictionVotingClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          convictionVotingAddress: process.env.NEBGOV_CONVICTION_VOTING_ADDRESS || "",
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const history = await client.getConvictionHistory(Number(id));
        output(history, global);
      }),
  );

program
  .command("optimistic-governor")
  .description("Optimistic governance commands")
  .addCommand(
    new Command("list")
      .option("--status <status>", "proposal status")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new OptimisticGovernorClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          optimisticGovernorAddress: process.env.NEBGOV_OPTIMISTIC_GOVERNOR_ADDRESS || "",
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const proposals = await client.listProposals(options.status as any);
        output(proposals, global);
      }),
  )
  .addCommand(
    new Command("get")
      .argument("<id>", "proposal id")
      .action(async (id: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new OptimisticGovernorClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          optimisticGovernorAddress: process.env.NEBGOV_OPTIMISTIC_GOVERNOR_ADDRESS || "",
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const proposal = await client.getProposal(Number(id));
        output(proposal, global);
      }),
  )
  .addCommand(
    new Command("config")
      .action(async () => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new OptimisticGovernorClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          optimisticGovernorAddress: process.env.NEBGOV_OPTIMISTIC_GOVERNOR_ADDRESS || "",
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const config = await client.getConfig();
        output(config, global);
      }),
  );

program
  .command("treasury-strategies")
  .description("Treasury strategies commands")
  .addCommand(
    new Command("list")
      .option("--limit <number>", "max strategies", "20")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new TreasuryStrategiesClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          treasuryStrategiesAddress: process.env.NEBGOV_TREASURY_STRATEGIES_ADDRESS || "",
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const strategies = await client.listStrategies({
          limit: Number(options.limit),
        });
        output(strategies, global);
      }),
  )
  .addCommand(
    new Command("get")
      .argument("<id>", "strategy id")
      .action(async (id: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new TreasuryStrategiesClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          treasuryStrategiesAddress: process.env.NEBGOV_TREASURY_STRATEGIES_ADDRESS || "",
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const strategy = await client.getStrategy(Number(id));
        output(strategy, global);
      }),
  );

program
  .command("signaling-polls")
  .description("Signaling polls commands")
  .addCommand(
    new Command("list")
      .option("--status <status>", "poll status (active or closed)")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new SignalingClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          signalAnchorAddress: process.env.NEBGOV_SIGNAL_ANCHOR_ADDRESS,
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const polls = await client.listPolls(options.status as any);
        output(polls, global);
      }),
  )
  .addCommand(
    new Command("get")
      .argument("<id>", "poll id")
      .action(async (id: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new SignalingClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          signalAnchorAddress: process.env.NEBGOV_SIGNAL_ANCHOR_ADDRESS,
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const poll = await client.getPoll(Number(id));
        output(poll, global);
      }),
  )
  .addCommand(
    new Command("results")
      .argument("<id>", "poll id")
      .action(async (id: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = new SignalingClient({
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          signalAnchorAddress: process.env.NEBGOV_SIGNAL_ANCHOR_ADDRESS,
          network: cfg.network,
          rpcUrl: cfg.rpcUrl,
        });

        const results = await client.getResults(Number(id));
        output(results, global);
      }),
  );

function coSponsorshipClient(cfg: NebGovCliConfig): CoSponsorshipClient {
  return new CoSponsorshipClient({
    network: cfg.network,
    governorAddress: required(cfg.governorAddress, "governorAddress"),
    timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
    votesAddress: required(cfg.votesAddress, "votesAddress"),
    coSponsorshipAddress: required(
      process.env.NEBGOV_CO_SPONSORSHIP_ADDRESS,
      "NEBGOV_CO_SPONSORSHIP_ADDRESS",
    ),
    indexerUrl: process.env.NEBGOV_INDEXER_URL,
    rpcUrl: cfg.rpcUrl,
  });
}

/** `show`/`list` shape: draft plus expiryLedger surfaced explicitly per #1316's AC. */
function formatDraft(draft: {
  id: bigint;
  creator: string;
  description: string;
  expiryLedger: number;
  createdLedger: number;
  coSponsors: string[];
  totalPower: bigint;
  finalized: boolean;
  cancelled: boolean;
}) {
  return {
    id: draft.id,
    creator: draft.creator,
    description: draft.description,
    createdLedger: draft.createdLedger,
    expiryLedger: draft.expiryLedger,
    coSponsors: draft.coSponsors,
    totalPower: draft.totalPower,
    finalized: draft.finalized,
    cancelled: draft.cancelled,
  };
}

program
  .command("drafts")
  .description("Co-sponsorship draft commands")
  .addCommand(
    new Command("list")
      .option("--status <status>", "active|finalized|cancelled|expired")
      .option("--page <number>", "page number", "1")
      .option("--limit <number>", "max drafts", "20")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = coSponsorshipClient(cfg);

        const { data, pagination } = await client.listDrafts({
          status: options.status,
          page: Number(options.page),
          limit: Number(options.limit),
        });
        output({ drafts: data.map(formatDraft), pagination }, global);
      }),
  )
  .addCommand(
    new Command("show")
      .argument("<draftId>", "draft id")
      .action(async (draftId: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const client = coSponsorshipClient(cfg);

        const draft = await client.getDraft(BigInt(draftId));
        const thresholdMet = await client.draftThresholdMet(BigInt(draftId));
        output({ ...formatDraft(draft), thresholdMet }, global);
      }),
  )
  .addCommand(
    new Command("create")
      .requiredOption("--description-file <file>", "draft description markdown/text file")
      .option("--metadata-uri <uri>", "off-chain metadata URI", "")
      .requiredOption("--target <address>", "target contract address")
      .requiredOption("--fn <name>", "target function name")
      .option("--calldata-hex <hex>", "hex calldata bytes (default empty)")
      .option("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);

        const description = await readFile(resolvePath(options.descriptionFile), "utf8");
        const descriptionHash = createHash("sha256").update(description).digest();
        const calldata = Buffer.from((options.calldataHex ?? "").replace(/^0x/i, ""), "hex");

        if (global.dryRun) {
          output(
            {
              action: "drafts.create",
              descriptionHash: descriptionHash.toString("hex"),
              target: options.target,
              fn: options.fn,
              calldataHex: calldata.toString("hex"),
            },
            global,
          );
          return;
        }

        const keypairPath = options.keypair ?? cfg.keypairFile;
        if (!keypairPath) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
        const signer = await loadKeypair(keypairPath);
        const client = coSponsorshipClient(cfg);

        const draftId = await client.createDraft(
          signer,
          description,
          descriptionHash,
          options.metadataUri,
          [options.target],
          [options.fn],
          [calldata],
        );
        output({ draftId }, global);
      }),
  )
  .addCommand(
    new Command("co-sponsor")
      .argument("<draftId>", "draft id")
      .requiredOption("--keypair <file>", "keypair file path")
      .action(async (draftId: string, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);

        if (global.dryRun) {
          output({ action: "drafts.co-sponsor", draftId }, global);
          return;
        }

        const signer = await loadKeypair(options.keypair);
        const client = coSponsorshipClient(cfg);
        const hash = await client.coSponsor(signer, BigInt(draftId));
        output({ ok: true, draftId, hash }, global);
      }),
  )
  .addCommand(
    new Command("withdraw")
      .argument("<draftId>", "draft id")
      .requiredOption("--keypair <file>", "keypair file path")
      .action(async (draftId: string, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);

        if (global.dryRun) {
          output({ action: "drafts.withdraw", draftId }, global);
          return;
        }

        const signer = await loadKeypair(options.keypair);
        const client = coSponsorshipClient(cfg);
        const hash = await client.withdrawCoSponsorship(signer, BigInt(draftId));
        output({ ok: true, draftId, hash }, global);
      }),
  )
  .addCommand(
    new Command("finalize")
      .argument("<draftId>", "draft id")
      .requiredOption("--keypair <file>", "keypair file path")
      .action(async (draftId: string, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);

        if (global.dryRun) {
          output({ action: "drafts.finalize", draftId }, global);
          return;
        }

        const signer = await loadKeypair(options.keypair);
        const client = coSponsorshipClient(cfg);
        const proposalId = await client.finalizeDraft(signer, BigInt(draftId));
        output({ draftId, proposalId }, global);
      }),
  )
  .addCommand(
    new Command("cancel")
      .argument("<draftId>", "draft id")
      .requiredOption("--keypair <file>", "keypair file path")
      .action(async (draftId: string, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);

        if (global.dryRun) {
          output({ action: "drafts.cancel", draftId }, global);
          return;
        }

        const signer = await loadKeypair(options.keypair);
        const client = coSponsorshipClient(cfg);
        const hash = await client.cancelDraft(signer, BigInt(draftId));
        output({ ok: true, draftId, hash }, global);
      }),
  );

program
  .command("vote-escrow")
  .description("Vote escrow commands")
  .addCommand(
    new Command("lock")
      .requiredOption("--amount <amount>", "amount to lock")
      .requiredOption("--duration <ledgers>", "duration in ledgers")
      .option("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const voteEscrowAddress =
          cfg.voteEscrowAddress ?? process.env.NEBGOV_VOTE_ESCROW_ADDRESS;
        const voteEscrow = new VoteEscrowClient({
          network: cfg.network,
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          voteEscrowAddress: required(voteEscrowAddress, "voteEscrowAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const amount = BigInt(options.amount);
        const duration = Number(options.duration);

        if (global.dryRun) {
          output({ action: "vote-escrow.lock", amount, duration }, global);
          return;
        }

        const keypairPath = options.keypair ?? cfg.keypairFile;
        if (!keypairPath) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
        const signer = await loadKeypair(keypairPath);
        const hash = await voteEscrow.createLock(signer, amount, duration);
        output({ action: "vote-escrow.lock", amount, duration, hash }, global);
      }),
  )
  .addCommand(
    new Command("increase")
      .requiredOption("--amount <amount>", "additional amount to lock")
      .option("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const voteEscrowAddress =
          cfg.voteEscrowAddress ?? process.env.NEBGOV_VOTE_ESCROW_ADDRESS;
        const voteEscrow = new VoteEscrowClient({
          network: cfg.network,
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          voteEscrowAddress: required(voteEscrowAddress, "voteEscrowAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const amount = BigInt(options.amount);

        if (global.dryRun) {
          output({ action: "vote-escrow.increase", amount }, global);
          return;
        }

        const keypairPath = options.keypair ?? cfg.keypairFile;
        if (!keypairPath) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
        const signer = await loadKeypair(keypairPath);
        const hash = await voteEscrow.increaseLockAmount(signer, amount);
        output({ action: "vote-escrow.increase", amount, hash }, global);
      }),
  )
  .addCommand(
    new Command("extend")
      .requiredOption("--new-end-ledger <ledger>", "new end ledger sequence")
      .option("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const voteEscrowAddress =
          cfg.voteEscrowAddress ?? process.env.NEBGOV_VOTE_ESCROW_ADDRESS;
        const voteEscrow = new VoteEscrowClient({
          network: cfg.network,
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          voteEscrowAddress: required(voteEscrowAddress, "voteEscrowAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const newEndLedger = Number(options.newEndLedger);

        if (global.dryRun) {
          output({ action: "vote-escrow.extend", newEndLedger }, global);
          return;
        }

        const keypairPath = options.keypair ?? cfg.keypairFile;
        if (!keypairPath) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
        const signer = await loadKeypair(keypairPath);
        const hash = await voteEscrow.extendLock(signer, newEndLedger);
        output({ action: "vote-escrow.extend", newEndLedger, hash }, global);
      }),
  )
  .addCommand(
    new Command("withdraw")
      .option("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const voteEscrowAddress =
          cfg.voteEscrowAddress ?? process.env.NEBGOV_VOTE_ESCROW_ADDRESS;
        const voteEscrow = new VoteEscrowClient({
          network: cfg.network,
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          voteEscrowAddress: required(voteEscrowAddress, "voteEscrowAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        if (global.dryRun) {
          output({ action: "vote-escrow.withdraw" }, global);
          return;
        }

        const keypairPath = options.keypair ?? cfg.keypairFile;
        if (!keypairPath) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
        const signer = await loadKeypair(keypairPath);
        const hash = await voteEscrow.withdraw(signer);
        output({ action: "vote-escrow.withdraw", hash }, global);
      }),
  )
  .addCommand(
    new Command("show")
      .argument("[owner]", "owner address")
      .option("--owner <address>", "owner address")
      .action(async (argOwner: string | undefined, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const voteEscrowAddress =
          cfg.voteEscrowAddress ?? process.env.NEBGOV_VOTE_ESCROW_ADDRESS;
        const voteEscrow = new VoteEscrowClient({
          network: cfg.network,
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          voteEscrowAddress: required(voteEscrowAddress, "voteEscrowAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const owner =
          argOwner ??
          options.owner ??
          cfg.defaultAccount ??
          (cfg.keypairFile ? (await loadKeypair(cfg.keypairFile)).publicKey() : undefined);

        if (!owner) throw new Error("Provide owner address or set NEBGOV_DEFAULT_ACCOUNT / keypair");

        const [lock, votingPower] = await Promise.all([
          voteEscrow.getLock(owner),
          voteEscrow.getVotingPower(owner),
        ]);
        output({ owner, lock, votingPower }, global);
      }),
  );

program
  .command("voting-rewards")
  .description("Voting rewards commands")
  .addCommand(
    new Command("epochs")
      .option("--epoch <id>", "epoch id to query")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const votingRewardsAddress =
          cfg.votingRewardsAddress ?? process.env.NEBGOV_VOTING_REWARDS_ADDRESS;
        const client = new VotingRewardsClient({
          network: cfg.network,
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          votingRewardsAddress: required(votingRewardsAddress, "votingRewardsAddress"),
          backendUrl: cfg.backendUrl ?? process.env.NEBGOV_BACKEND_URL,
          rpcUrl: cfg.rpcUrl,
        });

        if (options.epoch) {
          const epoch = await client.getEpoch(BigInt(options.epoch));
          output(epoch, global);
        } else {
          const [currentEpochId, availablePool] = await Promise.all([
            client.getCurrentEpochId(),
            client.getAvailablePool(),
          ]);
          const currentEpoch = await client.getEpoch(currentEpochId);
          output({ currentEpochId, availablePool, currentEpoch }, global);
        }
      }),
  )
  .addCommand(
    new Command("claims")
      .argument("[address]", "claimant address")
      .option("--address <address>", "claimant address")
      .action(async (argAddress: string | undefined, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const votingRewardsAddress =
          cfg.votingRewardsAddress ?? process.env.NEBGOV_VOTING_REWARDS_ADDRESS;
        const client = new VotingRewardsClient({
          network: cfg.network,
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          votingRewardsAddress: required(votingRewardsAddress, "votingRewardsAddress"),
          backendUrl: required(
            cfg.backendUrl ?? process.env.NEBGOV_BACKEND_URL,
            "backendUrl",
          ),
          rpcUrl: cfg.rpcUrl,
        });

        const address =
          argAddress ??
          options.address ??
          cfg.defaultAccount ??
          (cfg.keypairFile ? (await loadKeypair(cfg.keypairFile)).publicKey() : undefined);

        if (!address) throw new Error("Provide address or set NEBGOV_DEFAULT_ACCOUNT / keypair");

        const rewards = await client.getClaimableRewards(address);
        output(rewards, global);
      }),
  )
  .addCommand(
    new Command("claim")
      .requiredOption("--epoch <id>", "epoch id")
      .requiredOption("--amount <amount>", "claim amount")
      .requiredOption("--proof <proof>", "Merkle proof (JSON string array or comma-separated hex strings)")
      .option("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const votingRewardsAddress =
          cfg.votingRewardsAddress ?? process.env.NEBGOV_VOTING_REWARDS_ADDRESS;
        const client = new VotingRewardsClient({
          network: cfg.network,
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          votingRewardsAddress: required(votingRewardsAddress, "votingRewardsAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        let proof: string[];
        try {
          proof = JSON.parse(options.proof);
        } catch {
          proof = options.proof.split(",").map((s: string) => s.trim()).filter(Boolean);
        }

        const epochId = BigInt(options.epoch);
        const amount = BigInt(options.amount);

        if (global.dryRun) {
          output({ action: "voting-rewards.claim", epochId, amount, proof }, global);
          return;
        }

        const keypairPath = options.keypair ?? cfg.keypairFile;
        if (!keypairPath) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
        const signer = await loadKeypair(keypairPath);
        const hash = await client.claim(signer, epochId, amount, proof);
        output({ action: "voting-rewards.claim", epochId, amount, hash }, global);
      }),
  )
  .addCommand(
    new Command("fund")
      .requiredOption("--amount <amount>", "amount to fund")
      .option("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const votingRewardsAddress =
          cfg.votingRewardsAddress ?? process.env.NEBGOV_VOTING_REWARDS_ADDRESS;
        const client = new VotingRewardsClient({
          network: cfg.network,
          governorAddress: cfg.governorAddress ?? "",
          timelockAddress: cfg.timelockAddress ?? "",
          votesAddress: cfg.votesAddress ?? "",
          votingRewardsAddress: required(votingRewardsAddress, "votingRewardsAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const amount = BigInt(options.amount);

        if (global.dryRun) {
          output({ action: "voting-rewards.fund", amount }, global);
          return;
        }

        const keypairPath = options.keypair ?? cfg.keypairFile;
        if (!keypairPath) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
        const signer = await loadKeypair(keypairPath);
        const hash = await client.fundPool(signer, amount);
        output({ action: "voting-rewards.fund", amount, hash }, global);
      }),
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

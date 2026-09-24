import { Command } from "commander";
import {
  GovernorClient,
  VotesClient,
  TreasuryClient,
  FactoryClient,
  ProposalBondsClient,
  OptimisticGovernorClient,
  ConvictionVotingClient,
  TreasuryStrategiesClient,
  SignalingClient,
  type DeploySettings,
  type GovernorConfig,
  type GovernorEntry,
  type OptimisticProposalState,
} from "@nebgov/sdk";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  loadConfig,
  loadKeypair,
  required,
  resolvePath,
  type NebGovCliConfig,
} from "./config.js";
import { formatEnv, output, type GlobalOptions } from "./output.js";
import {
  parseAddress,
  parseAmount,
  parseChoice,
  parseContractAddress,
  parseFunctionName,
  parseHex,
  parseId,
  parsePositiveInt,
  parseRecipientsCsv,
  parseU32,
  parseU64,
  parseVoteSupport,
  parseVoteType,
} from "./validate.js";

const OPTIMISTIC_STATES: readonly OptimisticProposalState[] = [
  "ChallengeWindow",
  "Objected",
  "Passed",
  "Executed",
  "Cancelled",
];
const POLL_STATUSES = ["active", "closed"] as const;
const OUTPUT_FORMATS = ["env", "json"] as const;

function governorClient(cfg: NebGovCliConfig): GovernorClient {
  return new GovernorClient({
    network: cfg.network,
    governorAddress: required(cfg, "governorAddress"),
    timelockAddress: required(cfg, "timelockAddress"),
    votesAddress: required(cfg, "votesAddress"),
    rpcUrl: cfg.rpcUrl,
  });
}

function votesClient(cfg: NebGovCliConfig): VotesClient {
  return new VotesClient({
    network: cfg.network,
    governorAddress: required(cfg, "governorAddress"),
    timelockAddress: required(cfg, "timelockAddress"),
    votesAddress: required(cfg, "votesAddress"),
    rpcUrl: cfg.rpcUrl,
  });
}

function factoryClient(cfg: NebGovCliConfig): FactoryClient {
  return new FactoryClient({
    network: cfg.network,
    factoryAddress: parseContractAddress(required(cfg, "factoryAddress"), "factoryAddress"),
    rpcUrl: cfg.rpcUrl,
  });
}

/**
 * Config for the governance-module clients, which take a `GovernorConfig`
 * but only read their own contract address and the indexer/backend URLs.
 */
function moduleConfig(cfg: NebGovCliConfig, extra: Partial<GovernorConfig>): GovernorConfig {
  return {
    network: cfg.network,
    rpcUrl: cfg.rpcUrl,
    governorAddress: cfg.governorAddress ?? "",
    timelockAddress: cfg.timelockAddress ?? "",
    votesAddress: cfg.votesAddress ?? "",
    indexerUrl: cfg.indexerUrl,
    backendUrl: cfg.backendUrl,
    ...extra,
  };
}

async function defaultAccount(cfg: NebGovCliConfig): Promise<string | undefined> {
  if (cfg.defaultAccount) return cfg.defaultAccount;
  if (cfg.keypairFile) return (await loadKeypair(cfg.keypairFile)).publicKey();
  return undefined;
}

/** The env vars this CLI reads to target a governor, for pasting into `.env`. */
function governorEnv(entry: GovernorEntry, cfg: NebGovCliConfig): Record<string, string> {
  return {
    NEBGOV_NETWORK: cfg.network,
    NEBGOV_GOVERNOR_ADDRESS: entry.governor,
    NEBGOV_TIMELOCK_ADDRESS: entry.timelock,
    NEBGOV_VOTES_ADDRESS: entry.token,
  };
}

function printGovernor(
  entry: GovernorEntry,
  cfg: NebGovCliConfig,
  format: (typeof OUTPUT_FORMATS)[number],
  global: GlobalOptions,
  comment: string,
): void {
  if (format === "env") {
    console.log(formatEnv(governorEnv(entry, cfg), comment));
    return;
  }
  output(entry, global);
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name("nebgov")
    .description("NebGov terminal governance CLI")
    .option("--human", "human-readable output instead of JSON", false)
    .option("--dry-run", "simulate actions without submitting transactions", false)
    .option("--config <path>", "path to config file (defaults to ~/.nebgov/config.json)");

  const context = async () => {
    const global = program.opts<GlobalOptions>();
    const cfg = await loadConfig(global.config);
    return { global, cfg };
  };

  program
    .command("proposals")
    .description("Proposal commands")
    .addCommand(
      new Command("list")
        .option("--proposer <address>", "proposer address to list")
        .option("--limit <number>", "max proposals", "20")
        .action(async (options) => {
          const { global, cfg } = await context();
          const limit = parsePositiveInt(options.limit, "limit");
          const proposer = options.proposer
            ? parseAddress(options.proposer, "proposer")
            : await defaultAccount(cfg);
          if (!proposer) {
            throw new Error("Provide --proposer or set NEBGOV_DEFAULT_ACCOUNT / keypair");
          }

          const proposals = await governorClient(cfg).getProposalsForAddress(proposer, { limit });
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
          const { global, cfg } = await context();
          const proposalId = parseU64(id, "id");
          const governor = governorClient(cfg);
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
          const { global, cfg } = await context();
          const target = parseContractAddress(options.target, "target");
          const fn = parseFunctionName(options.fn, "fn");
          const calldata = parseHex(options.calldataHex, "calldata-hex");
          const description = await readFile(resolvePath(options.descriptionFile), "utf8");
          const descriptionHash = createHash("sha256").update(description).digest("hex");

          if (global.dryRun) {
            output(
              {
                action: "proposals.create",
                title: options.title,
                descriptionHash,
                target,
                fn,
                calldataHex: calldata.toString("hex"),
              },
              global,
            );
            return;
          }

          const keypairPath = options.keypair ?? cfg.keypairFile;
          if (!keypairPath) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
          const signer = await loadKeypair(keypairPath);
          const proposalId = await governorClient(cfg).propose(
            signer,
            options.title,
            descriptionHash,
            "",
            [target],
            [fn],
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
          const { global, cfg } = await context();
          const id = parseU64(proposalId, "proposalId");
          const voteSupport = parseVoteSupport(support);
          const governor = governorClient(cfg);
          if (global.dryRun) {
            output({ action: "vote.cast", proposalId: id, support: voteSupport }, global);
            return;
          }

          const signer = await loadKeypair(options.keypair);
          await governor.castVote(signer, id, voteSupport);
          output({ ok: true, proposalId: id, support: voteSupport }, global);
        }),
    )
    .addCommand(
      new Command("status")
        .argument("<proposalId>", "proposal id")
        .option("--voter <address>", "voter address")
        .action(async (proposalId: string, options) => {
          const { global, cfg } = await context();
          const id = parseU64(proposalId, "proposalId");
          const voter = options.voter ? parseAddress(options.voter, "voter") : await defaultAccount(cfg);
          if (!voter) throw new Error("Provide --voter or set NEBGOV_DEFAULT_ACCOUNT / keypair");

          const receipt = await governorClient(cfg).getReceipt(id, voter);
          output({ proposalId: id, voter, receipt }, global);
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
          const { global, cfg } = await context();
          const delegatee = parseAddress(address, "delegatee");
          const votes = votesClient(cfg);
          if (global.dryRun) {
            output({ action: "delegate.to", delegatee }, global);
            return;
          }

          const signer = await loadKeypair(options.keypair);
          await votes.delegate(signer, delegatee);
          output({ ok: true, delegatee, delegator: signer.publicKey() }, global);
        }),
    )
    .addCommand(
      new Command("show")
        .argument("<address>", "delegator address")
        .action(async (address: string) => {
          const { global, cfg } = await context();
          const delegator = parseAddress(address, "address");
          const votes = votesClient(cfg);
          const [delegatee, votingPower] = await Promise.all([
            votes.getDelegatee(delegator),
            votes.getVotes(delegator),
          ]);
          output({ address: delegator, delegatee, votingPower }, global);
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
          const { global, cfg } = await context();
          const token = options.token ? parseContractAddress(options.token, "token") : undefined;
          const viewer = options.viewer ? parseAddress(options.viewer, "viewer") : await defaultAccount(cfg);
          if (!viewer) throw new Error("Provide --viewer or set NEBGOV_DEFAULT_ACCOUNT / keypair");

          const treasury = new TreasuryClient({
            network: cfg.network,
            treasuryAddress: required(cfg, "treasuryAddress"),
            rpcUrl: cfg.rpcUrl,
            simulationAccount: viewer,
          });

          const [owners, threshold, txCount] = await Promise.all([
            treasury.getOwners(),
            treasury.getThreshold(),
            treasury.getTxCount(),
          ]);
          const spentThisPeriod = token ? await treasury.getSpentThisPeriod(token) : null;

          output(
            {
              viewer,
              owners,
              threshold,
              txCount,
              spentThisPeriod,
              token: token ?? null,
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
          const { global, cfg } = await context();
          const token = parseContractAddress(options.token, "token");
          const treasury = new TreasuryClient({
            network: cfg.network,
            treasuryAddress: required(cfg, "treasuryAddress"),
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
                token,
                recipients,
                count: recipients.length,
              },
              global,
            );
            return;
          }

          const signer = await loadKeypair(options.keypair);
          const opHash = await treasury.batchTransfer(signer, token, recipients);
          output({ opHash, recipients: recipients.length }, global);
        }),
    );

  program
    .command("factory")
    .description("Governor factory commands: deploy and inspect governance instances")
    .addCommand(
      new Command("deploy")
        .description("Deploy a new governor, timelock and token-votes set through the factory")
        .requiredOption("--token <address>", "underlying SEP-41 token contract the voting power wraps")
        .option("--guardian <address>", "guardian allowed to cancel proposals (default: the deployer)")
        .option("--voting-delay <ledgers>", "ledgers between proposal creation and voting start", "60")
        .option("--voting-period <ledgers>", "ledgers the vote stays open", "17280")
        .option("--quorum-numerator <percent>", "quorum as a percentage of total voting power (0-100)", "4")
        .option("--proposal-threshold <amount>", "voting power required to propose, in base units", "100000000")
        .option("--timelock-delay <seconds>", "minimum delay before a queued proposal can execute", "3600")
        .option("--vote-type <type>", "simple|extended|quadratic", "extended")
        .option("--proposal-grace-period <ledgers>", "ledgers a succeeded proposal stays executable", "120960")
        .option("--keypair <file>", "deployer keypair file path")
        .option("--format <format>", "output format: env|json", "env")
        .action(async (options) => {
          const { global, cfg } = await context();
          const format = parseChoice(options.format, "format", OUTPUT_FORMATS);
          const factoryAddress = parseContractAddress(required(cfg, "factoryAddress"), "factoryAddress");
          const token = parseContractAddress(options.token, "token");
          const votingPeriod = parseU32(options.votingPeriod, "voting-period");
          const quorumNumerator = parseU32(options.quorumNumerator, "quorum-numerator");
          const timelockDelay = parseU64(options.timelockDelay, "timelock-delay");
          // Mirror the factory contract's own checks so a bad deploy fails before signing.
          if (votingPeriod === 0) throw new Error("voting-period must be greater than 0");
          if (quorumNumerator > 100) throw new Error("quorum-numerator must be between 0 and 100");
          if (timelockDelay === 0n) throw new Error("timelock-delay must be greater than 0");

          const keypairPath = options.keypair ?? cfg.keypairFile;
          const needsSigner = !global.dryRun || !options.guardian;
          const signer = keypairPath && needsSigner ? await loadKeypair(keypairPath) : undefined;
          if (!global.dryRun && !signer) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
          const guardian = options.guardian ? parseAddress(options.guardian, "guardian") : signer?.publicKey();
          if (!guardian) {
            throw new Error("Provide --guardian, or --keypair to default the guardian to the deployer");
          }

          const settings: DeploySettings = {
            votingDelay: parseU32(options.votingDelay, "voting-delay"),
            votingPeriod,
            quorumNumerator,
            proposalThreshold: parseAmount(options.proposalThreshold, "proposal-threshold"),
            timelockDelay,
            guardian,
            voteType: parseVoteType(options.voteType),
            proposalGracePeriod: parseU32(options.proposalGracePeriod, "proposal-grace-period"),
          };

          if (global.dryRun) {
            output(
              {
                action: "factory.deploy",
                factory: factoryAddress,
                deployer: signer?.publicKey() ?? null,
                token,
                ...settings,
              },
              global,
            );
            return;
          }

          const factory = factoryClient(cfg);
          const id = await factory.deploy(signer!, token, settings);
          let entry: GovernorEntry;
          try {
            entry = await factory.getGovernor(id);
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(
              `Governor #${id} was deployed but its addresses could not be read (${reason}). ` +
                `Retrieve them with: nebgov factory show ${id} --format env`,
            );
          }
          printGovernor(entry, cfg, format, global, `NebGov governor #${id} deployed via factory ${factoryAddress}`);
        }),
    )
    .addCommand(
      new Command("list")
        .description("List governors deployed through the factory")
        .option("--limit <number>", "max governors", "20")
        .option("--offset <number>", "number of governors to skip", "0")
        .action(async (options) => {
          const { global, cfg } = await context();
          const limit = parsePositiveInt(options.limit, "limit");
          const offset = parseId(options.offset, "offset");
          const governors = await factoryClient(cfg).getAllGovernors({ limit, offset });
          output(governors, global);
        }),
    )
    .addCommand(
      new Command("show")
        .description("Show one factory-deployed governor")
        .argument("<id>", "governor id")
        .option("--format <format>", "output format: json|env", "json")
        .action(async (id: string, options) => {
          const { global, cfg } = await context();
          const governorId = parseU64(id, "id");
          const format = parseChoice(options.format, "format", OUTPUT_FORMATS);
          const entry = await factoryClient(cfg).getGovernor(governorId);
          printGovernor(entry, cfg, format, global, `NebGov governor #${governorId}`);
        }),
    );

  program
    .command("proposal-bonds")
    .description("Proposal bonds commands")
    .addCommand(
      new Command("list")
        .option("--limit <number>", "max bonds", "20")
        .action(async (options) => {
          const { global, cfg } = await context();
          const limit = parsePositiveInt(options.limit, "limit");
          const client = new ProposalBondsClient(
            moduleConfig(cfg, { proposalBondsAddress: required(cfg, "proposalBondsAddress") }),
          );
          output(await client.listBonds({ limit }), global);
        }),
    )
    .addCommand(
      new Command("settings")
        .action(async () => {
          const { global, cfg } = await context();
          const client = new ProposalBondsClient(
            moduleConfig(cfg, { proposalBondsAddress: required(cfg, "proposalBondsAddress") }),
          );
          output(await client.getSettings(), global);
        }),
    );

  program
    .command("conviction-voting")
    .description("Conviction voting commands")
    .addCommand(
      new Command("proposal")
        .argument("<id>", "proposal id")
        .action(async (id: string) => {
          const { global, cfg } = await context();
          const proposalId = parseId(id, "id");
          const client = new ConvictionVotingClient(
            moduleConfig(cfg, { convictionVotingAddress: required(cfg, "convictionVotingAddress") }),
          );
          output(await client.getProposal(proposalId), global);
        }),
    )
    .addCommand(
      new Command("history")
        .argument("<id>", "proposal id")
        .action(async (id: string) => {
          const { global, cfg } = await context();
          const proposalId = parseId(id, "id");
          const client = new ConvictionVotingClient(
            moduleConfig(cfg, { convictionVotingAddress: required(cfg, "convictionVotingAddress") }),
          );
          output(await client.getConvictionHistory(proposalId), global);
        }),
    );

  program
    .command("optimistic-governor")
    .description("Optimistic governance commands")
    .addCommand(
      new Command("list")
        .option("--status <status>", `proposal status (${OPTIMISTIC_STATES.join(", ")})`)
        .action(async (options) => {
          const { global, cfg } = await context();
          const status = options.status ? parseChoice(options.status, "status", OPTIMISTIC_STATES) : undefined;
          const client = new OptimisticGovernorClient(
            moduleConfig(cfg, { optimisticGovernorAddress: required(cfg, "optimisticGovernorAddress") }),
          );
          output(await client.listProposals(status), global);
        }),
    )
    .addCommand(
      new Command("get")
        .argument("<id>", "proposal id")
        .action(async (id: string) => {
          const { global, cfg } = await context();
          const proposalId = parseId(id, "id");
          const client = new OptimisticGovernorClient(
            moduleConfig(cfg, { optimisticGovernorAddress: required(cfg, "optimisticGovernorAddress") }),
          );
          output(await client.getProposal(proposalId), global);
        }),
    )
    .addCommand(
      new Command("config")
        .action(async () => {
          const { global, cfg } = await context();
          const client = new OptimisticGovernorClient(
            moduleConfig(cfg, { optimisticGovernorAddress: required(cfg, "optimisticGovernorAddress") }),
          );
          output(await client.getConfig(), global);
        }),
    );

  program
    .command("treasury-strategies")
    .description("Treasury strategies commands")
    .addCommand(
      new Command("list")
        .option("--limit <number>", "max strategies", "20")
        .action(async (options) => {
          const { global, cfg } = await context();
          const limit = parsePositiveInt(options.limit, "limit");
          const client = new TreasuryStrategiesClient(
            moduleConfig(cfg, { treasuryStrategiesAddress: required(cfg, "treasuryStrategiesAddress") }),
          );
          output(await client.listStrategies({ limit }), global);
        }),
    )
    .addCommand(
      new Command("get")
        .argument("<id>", "strategy id")
        .action(async (id: string) => {
          const { global, cfg } = await context();
          const strategyId = parseId(id, "id");
          const client = new TreasuryStrategiesClient(
            moduleConfig(cfg, { treasuryStrategiesAddress: required(cfg, "treasuryStrategiesAddress") }),
          );
          output(await client.getStrategy(strategyId), global);
        }),
    );

  program
    .command("signaling-polls")
    .description("Signaling polls commands")
    .addCommand(
      new Command("list")
        .option("--status <status>", "poll status (active or closed)")
        .action(async (options) => {
          const { global, cfg } = await context();
          const status = options.status ? parseChoice(options.status, "status", POLL_STATUSES) : undefined;
          const client = new SignalingClient(moduleConfig(cfg, { backendUrl: required(cfg, "backendUrl") }));
          output(await client.listPolls(status), global);
        }),
    )
    .addCommand(
      new Command("get")
        .argument("<id>", "poll id")
        .action(async (id: string) => {
          const { global, cfg } = await context();
          const pollId = parseId(id, "id");
          const client = new SignalingClient(moduleConfig(cfg, { backendUrl: required(cfg, "backendUrl") }));
          output(await client.getPoll(pollId), global);
        }),
    )
    .addCommand(
      new Command("results")
        .argument("<id>", "poll id")
        .action(async (id: string) => {
          const { global, cfg } = await context();
          const pollId = parseId(id, "id");
          const client = new SignalingClient(moduleConfig(cfg, { backendUrl: required(cfg, "backendUrl") }));
          output(await client.getResults(pollId), global);
        }),
    );

  return program;
}

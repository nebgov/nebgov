import { Command } from "commander";
import { GuardianCouncilClient, type GuardianAction } from "@nebgov/sdk";
import { loadKeypair, required, type NebGovCliConfig } from "./config.js";
import { output, type GlobalOptions } from "./output.js";
import {
  parseChoice,
  parseU64,
  parseU32,
  parseAddress,
  parseContractAddress,
} from "./validate.js";

/** Register the same council workflow in both CLI entry points. */
export function registerGuardianCouncil(
  program: Command,
  context: () => Promise<{ global: GlobalOptions; cfg: NebGovCliConfig }>,
): void {
  const council = program
    .command("guardian-council")
    .description("Emergency guardian council actions and views");
  const councilClient = async (cfg: NebGovCliConfig) =>
    new GuardianCouncilClient({
      network: cfg.network,
      rpcUrl: cfg.rpcUrl,
      guardianCouncilAddress: parseContractAddress(
        required(cfg, "guardianCouncilAddress"),
        "guardianCouncilAddress",
      ),
      simulationAccount:
        cfg.defaultAccount ??
        (cfg.keypairFile
          ? (await loadKeypair(cfg.keypairFile)).publicKey()
          : undefined),
    });
  council.addCommand(
    new Command("propose")
      .argument(
        "<action>",
        "Pause, Unpause, CancelActive, CancelQueued, RotateMember, or SetThreshold",
      )
      .option("--proposal-id <id>", "proposal to cancel")
      .option("--old <address>", "member to replace")
      .option("--new <address>", "replacement member")
      .option("--threshold <number>", "new approval threshold")
      .requiredOption("--keypair <file>", "proposer keypair file")
      .action(async (kind: string, options) => {
        const { global, cfg } = await context();
        const tag = parseChoice(kind, "action", [
          "Pause",
          "Unpause",
          "CancelActive",
          "CancelQueued",
          "RotateMember",
          "SetThreshold",
        ] as const);
        let action: GuardianAction;
        switch (tag) {
          case "Pause":
          case "Unpause":
            action = { tag };
            break;
          case "CancelActive":
          case "CancelQueued":
            action = {
              tag,
              proposalId: parseU64(options.proposalId ?? "", "proposal-id"),
            };
            break;
          case "RotateMember":
            action = {
              tag,
              old: parseAddress(options.old ?? "", "old"),
              new: parseAddress(options.new ?? "", "new"),
            };
            break;
          case "SetThreshold": {
            const threshold = parseU32(options.threshold ?? "", "threshold");
            if (threshold === 0)
              throw new Error("threshold must be at least 1");
            action = { tag, threshold };
            break;
          }
        }
        if (global.dryRun) {
          output(
            { action: "guardian-council.propose", guardianAction: action },
            global,
          );
          return;
        }
        const signer = await loadKeypair(options.keypair);
        output(
          {
            actionId: await (
              await councilClient(cfg)
            ).proposeAction(signer, action),
          },
          global,
        );
      }),
  );
  for (const [name, method] of [
    ["approve", "approveAction"],
    ["revoke", "revokeApproval"],
    ["execute", "executeAction"],
  ] as const) {
    council.addCommand(
      new Command(name)
        .argument("<id>", "action id")
        .requiredOption("--keypair <file>", "signing keypair file")
        .action(async (id: string, options) => {
          const { global, cfg } = await context();
          const actionId = parseU64(id, "id");
          if (global.dryRun) {
            output({ action: `guardian-council.${name}`, actionId }, global);
            return;
          }
          const signer = await loadKeypair(options.keypair);
          output(
            {
              hash: await (await councilClient(cfg))[method](signer, actionId),
            },
            global,
          );
        }),
    );
  }
  council.addCommand(
    new Command("get")
      .argument("<id>", "action id")
      .action(async (id: string) => {
        const { global, cfg } = await context();
        const actionId = parseU64(id, "id");
        output(await (await councilClient(cfg)).getAction(actionId), global);
      }),
  );
  for (const [name, method] of [
    ["members", "getMembers"],
    ["threshold", "getThreshold"],
  ] as const) {
    council.addCommand(
      new Command(name).action(async () => {
        const { global, cfg } = await context();
        output(await (await councilClient(cfg))[method](), global);
      }),
    );
  }
}

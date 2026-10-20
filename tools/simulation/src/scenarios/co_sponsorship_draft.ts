import { ProposalState } from "@nebgov/sdk";
import { Actor } from "../actors";
import { SimulationHarness } from "../harness";
import { BaseScenario, SimulationResult } from "./base";

export interface CoSponsorshipDraftScenarioConfig {
  creator: Actor;
  coSponsors: Actor[];
  description: string;
  targets: string[];
  fnNames: string[];
  calldatas: Buffer[];
}

/** Creates a draft, pools sponsor power, and finalizes it into a governor proposal. */
export class CoSponsorshipDraftScenario extends BaseScenario {
  constructor(
    harness: SimulationHarness,
    private config: CoSponsorshipDraftScenarioConfig,
  ) {
    super(harness);
  }

  async run(): Promise<SimulationResult> {
    const startLedger = this.harness.clock.sequence;
    const { coSponsorshipClient, governorClient } = this.harness;
    const descriptionHash = Buffer.from("a".repeat(64), "hex");
    const draftId = await coSponsorshipClient.createDraft(
      this.config.creator.keypair,
      this.config.description,
      descriptionHash,
      "ipfs://simulation/co-sponsorship",
      this.config.targets,
      this.config.fnNames,
      this.config.calldatas,
    );

    let draft = await coSponsorshipClient.getDraft(draftId);
    if (draft.id !== draftId || draft.creator !== this.config.creator.publicKey || draft.totalPower !== 0n) {
      throw new Error("Draft creation did not preserve creator and initial pledge state");
    }
    if (draft.coSponsors.length !== 0 || draft.finalized || draft.cancelled) {
      throw new Error("New draft must have no sponsors and remain open");
    }

    let pledgedPower = 0n;
    for (let i = 0; i < this.config.coSponsors.length; i++) {
      const sponsor = this.config.coSponsors[i];
      await coSponsorshipClient.coSponsor(sponsor.keypair, draftId);
      draft = await coSponsorshipClient.getDraft(draftId);
      const currentPower = await this.harness.votesClient.getVotes(sponsor.publicKey);
      pledgedPower += currentPower;

      if (draft.coSponsors.length !== i + 1 || draft.coSponsors[i] !== sponsor.publicKey) {
        throw new Error(`Draft did not record co-sponsor ${sponsor.publicKey}`);
      }
      if (draft.coSponsorPower[i] !== currentPower) {
        throw new Error(`Draft did not record the current pledge for co-sponsor ${sponsor.publicKey}`);
      }
      if (draft.totalPower !== pledgedPower || draft.finalized) {
        throw new Error("Draft total power or open state is incorrect after co-sponsorship");
      }
    }

    const proposalId = await coSponsorshipClient.finalizeDraft(this.config.creator.keypair, draftId);
    draft = await coSponsorshipClient.getDraft(draftId);
    if (!draft.finalized || draft.totalPower !== pledgedPower) {
      throw new Error("Finalization did not persist the completed co-sponsorship state");
    }

    const proposal = await governorClient.getProposal(proposalId);
    const finalState = await governorClient.getProposalState(proposalId);
    if (
      proposal.id !== proposalId ||
      proposal.proposer !== this.config.creator.publicKey ||
      proposal.description !== this.config.description ||
      finalState !== ProposalState.Pending
    ) {
      throw new Error("Finalized draft did not create the expected pending governor proposal");
    }

    return {
      success: true,
      proposalId,
      finalState,
      ledgersElapsed: this.harness.clock.sequence - startLedger,
      errors: [],
    };
  }
}

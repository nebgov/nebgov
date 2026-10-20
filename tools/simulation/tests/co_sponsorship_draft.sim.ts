import { ProposalState } from "@nebgov/sdk";
import { CoSponsorshipDraftScenario, DeployedContracts, SimulationHarness } from "../src";
import { buildTestSetup, PLACEHOLDER_CALLDATA } from "./helpers";

describe("Co-sponsorship draft (mock runtime)", () => {
  let harness: SimulationHarness;
  let setup: ReturnType<typeof buildTestSetup>;
  let addresses: DeployedContracts;

  beforeAll(async () => {
    setup = buildTestSetup({
      proposers: 1,
      voters: 2,
      balances: {
        "proposer-0": 0n,
        "voter-0": 1_000_000n,
        "voter-1": 1_000_000n,
      },
      settings: { proposalThreshold: 2_000_000n },
    });
    harness = new SimulationHarness(setup.config);
    harness.registerActors(setup.actors);
    addresses = await harness.boot();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it("pools co-sponsor power and finalizes the draft into a proposal", async () => {
    const result = await harness.run(CoSponsorshipDraftScenario, {
      creator: setup.actors.proposers[0],
      coSponsors: setup.actors.voters,
      description: "Fund a shared community grant",
      targets: [addresses.governor],
      fnNames: ["noop"],
      calldatas: [PLACEHOLDER_CALLDATA],
    });

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.finalState).toBe(ProposalState.Pending);
    expect(result.proposalId).toBe(1n);
  });
});

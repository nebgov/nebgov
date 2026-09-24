jest.mock("@nebgov/sdk", () => jest.requireActual("./sdkMock").mockSdk());

import { GovernorClient, VoteSupport, VotesClient } from "@nebgov/sdk";
import { createHash } from "node:crypto";
import { stubClient } from "./sdkMock";
import {
  ACCOUNT,
  BASE_CONFIG,
  GOVERNOR,
  OTHER_ACCOUNT,
  SIGNER,
  TIMELOCK,
  TOKEN,
  VOTES,
  runCli,
  useCleanEnvironment,
  writeKeypairFile,
  writeTemp,
} from "./helpers";

useCleanEnvironment();

const governorConfig = { network: "testnet", governorAddress: GOVERNOR, timelockAddress: TIMELOCK, votesAddress: VOTES };

describe("proposals", () => {
  it("list: queries the given proposer with the parsed limit", async () => {
    const governor = stubClient(GovernorClient, {
      getProposalsForAddress: jest.fn().mockResolvedValue([
        { id: 3n, state: "Active", proposal: { proposer: ACCOUNT, description: "Raise quorum" } },
      ]),
    });

    const result = await runCli(["proposals", "list", "--proposer", ACCOUNT, "--limit", "5"]);

    expect(GovernorClient).toHaveBeenCalledWith(expect.objectContaining(governorConfig));
    expect(governor.getProposalsForAddress).toHaveBeenCalledWith(ACCOUNT, { limit: 5 });
    expect(result.json()).toEqual([{ id: "3", state: "Active", proposer: ACCOUNT, description: "Raise quorum" }]);
  });

  it("list: falls back to the default account from config", async () => {
    const governor = stubClient(GovernorClient, { getProposalsForAddress: jest.fn().mockResolvedValue([]) });
    await runCli(["proposals", "list"], { ...BASE_CONFIG, defaultAccount: OTHER_ACCOUNT });
    expect(governor.getProposalsForAddress).toHaveBeenCalledWith(OTHER_ACCOUNT, { limit: 20 });
  });

  it("list: rejects a bad proposer, a bad limit, and a missing proposer", async () => {
    stubClient(GovernorClient, { getProposalsForAddress: jest.fn() });
    await expect(runCli(["proposals", "list", "--proposer", "GNOPE"])).rejects.toThrow(/proposer must be a Stellar/);
    await expect(runCli(["proposals", "list", "--proposer", ACCOUNT, "--limit", "0"])).rejects.toThrow(
      /limit must be at least 1/,
    );
    await expect(runCli(["proposals", "list"])).rejects.toThrow(/Provide --proposer/);
  });

  it("list: reports missing governor config before touching the network", async () => {
    await expect(
      runCli(["proposals", "list", "--proposer", ACCOUNT], { network: "testnet" }),
    ).rejects.toThrow(/Missing required config: governorAddress/);
    expect(GovernorClient).not.toHaveBeenCalled();
  });

  it("get: parses the id as a u64 and fetches proposal, state and votes", async () => {
    const governor = stubClient(GovernorClient, {
      getProposal: jest.fn().mockResolvedValue({ proposer: ACCOUNT }),
      getProposalState: jest.fn().mockResolvedValue("Succeeded"),
      getProposalVotes: jest.fn().mockResolvedValue({ votesFor: 10n }),
    });

    const result = await runCli(["proposals", "get", "42"]);

    for (const method of [governor.getProposal, governor.getProposalState, governor.getProposalVotes]) {
      expect(method).toHaveBeenCalledWith(42n);
    }
    expect(result.json()).toEqual({
      id: "42",
      state: "Succeeded",
      proposal: { proposer: ACCOUNT },
      votes: { votesFor: "10" },
    });
  });

  it("get: rejects a non-numeric id", async () => {
    await expect(runCli(["proposals", "get", "abc"])).rejects.toThrow(/id must be a non-negative integer/);
  });

  describe("create", () => {
    const description = "# Raise quorum\n\nBump the quorum to 5%.";
    const descriptionHash = createHash("sha256").update(description).digest("hex");
    const args = () => [
      "proposals",
      "create",
      "--title",
      "Raise quorum",
      "--description-file",
      writeTemp("proposal.md", description),
      "--target",
      TOKEN,
      "--fn",
      "set_quorum",
      "--calldata-hex",
      "0x0005",
    ];

    it("submits the hashed description and decoded calldata", async () => {
      const governor = stubClient(GovernorClient, { propose: jest.fn().mockResolvedValue(9n) });

      const result = await runCli([...args(), "--keypair", writeKeypairFile()]);

      expect(governor.propose).toHaveBeenCalledWith(
        expect.objectContaining({}),
        "Raise quorum",
        descriptionHash,
        "",
        [TOKEN],
        ["set_quorum"],
        [Buffer.from([0x00, 0x05])],
      );
      expect(governor.propose.mock.calls[0][0].publicKey()).toBe(SIGNER.publicKey());
      expect(result.json()).toEqual({ proposalId: "9" });
    });

    it("--dry-run prints the built call without signing", async () => {
      const governor = stubClient(GovernorClient, { propose: jest.fn() });

      const result = await runCli(["--dry-run", ...args()]);

      expect(governor.propose).not.toHaveBeenCalled();
      expect(result.json()).toEqual({
        action: "proposals.create",
        title: "Raise quorum",
        descriptionHash,
        target: TOKEN,
        fn: "set_quorum",
        calldataHex: "0005",
      });
    });

    it("uses the keypair file from config when --keypair is omitted", async () => {
      const governor = stubClient(GovernorClient, { propose: jest.fn().mockResolvedValue(1n) });
      await runCli(args(), { ...BASE_CONFIG, keypairFile: writeKeypairFile() });
      expect(governor.propose).toHaveBeenCalled();
    });

    it("requires a keypair when not a dry run", async () => {
      stubClient(GovernorClient, { propose: jest.fn() });
      await expect(runCli(args())).rejects.toThrow("Missing --keypair or NEBGOV_KEYPAIR_FILE");
    });

    it.each([
      [["--target", ACCOUNT], /target must be a Stellar contract/],
      [["--fn", "set-quorum"], /fn must be 1-32 characters/],
      [["--calldata-hex", "0x123"], /calldata-hex must be an even-length hex string/],
    ])("rejects invalid %p", async (override, message) => {
      const governor = stubClient(GovernorClient, { propose: jest.fn() });
      await expect(runCli(["--dry-run", ...args(), ...override])).rejects.toThrow(message);
      expect(governor.propose).not.toHaveBeenCalled();
    });

    it("requires --title", async () => {
      const withoutTitle = args().filter((arg, i, all) => arg !== "--title" && all[i - 1] !== "--title");
      await expect(runCli(withoutTitle)).rejects.toThrow(/required option '--title <title>' not specified/);
    });
  });
});

describe("vote", () => {
  it("cast: submits the mapped support value", async () => {
    const governor = stubClient(GovernorClient, { castVote: jest.fn().mockResolvedValue("txhash") });

    const result = await runCli(["vote", "cast", "7", "Against", "--keypair", writeKeypairFile()]);

    expect(governor.castVote).toHaveBeenCalledWith(expect.anything(), 7n, VoteSupport.Against);
    expect(governor.castVote.mock.calls[0][0].publicKey()).toBe(SIGNER.publicKey());
    expect(result.json()).toEqual({ ok: true, proposalId: "7", support: VoteSupport.Against });
  });

  it("cast --dry-run: does not sign or submit", async () => {
    const governor = stubClient(GovernorClient, { castVote: jest.fn() });
    const result = await runCli(["--dry-run", "vote", "cast", "7", "abstain", "--keypair", "/does/not/exist"]);
    expect(governor.castVote).not.toHaveBeenCalled();
    expect(result.json()).toEqual({ action: "vote.cast", proposalId: "7", support: VoteSupport.Abstain });
  });

  it("cast: rejects unknown support, bad ids and a missing --keypair", async () => {
    const governor = stubClient(GovernorClient, { castVote: jest.fn() });
    await expect(runCli(["vote", "cast", "7", "yes", "--keypair", "k"])).rejects.toThrow(
      "support must be one of: for, against, abstain",
    );
    await expect(runCli(["vote", "cast", "x", "for", "--keypair", "k"])).rejects.toThrow(
      /proposalId must be a non-negative integer/,
    );
    await expect(runCli(["vote", "cast", "7", "for"])).rejects.toThrow(/required option '--keypair <file>'/);
    await expect(runCli(["vote", "cast", "7", "--keypair", "k"])).rejects.toThrow(/missing required argument 'support'/);
    expect(governor.castVote).not.toHaveBeenCalled();
  });

  it("status: reads the receipt for the given voter", async () => {
    const receipt = { hasVoted: true, support: VoteSupport.For, weight: 5n, reason: "" };
    const governor = stubClient(GovernorClient, { getReceipt: jest.fn().mockResolvedValue(receipt) });

    const result = await runCli(["vote", "status", "7", "--voter", ACCOUNT]);

    expect(governor.getReceipt).toHaveBeenCalledWith(7n, ACCOUNT);
    expect(result.json()).toEqual({
      proposalId: "7",
      voter: ACCOUNT,
      receipt: { hasVoted: true, support: VoteSupport.For, weight: "5", reason: "" },
    });
  });

  it("status: defaults the voter to the configured keypair's account", async () => {
    const governor = stubClient(GovernorClient, { getReceipt: jest.fn().mockResolvedValue({}) });
    await runCli(["vote", "status", "7"], { ...BASE_CONFIG, keypairFile: writeKeypairFile() });
    expect(governor.getReceipt).toHaveBeenCalledWith(7n, SIGNER.publicKey());
  });

  it("status: rejects a malformed voter", async () => {
    await expect(runCli(["vote", "status", "7", "--voter", "nobody"])).rejects.toThrow(/voter must be a Stellar/);
  });
});

describe("delegate", () => {
  it("to: delegates from the signer to the validated address", async () => {
    const votes = stubClient(VotesClient, { delegate: jest.fn().mockResolvedValue(undefined) });

    const result = await runCli(["delegate", "to", ACCOUNT, "--keypair", writeKeypairFile()]);

    expect(VotesClient).toHaveBeenCalledWith(expect.objectContaining(governorConfig));
    expect(votes.delegate).toHaveBeenCalledWith(expect.anything(), ACCOUNT);
    expect(result.json()).toEqual({ ok: true, delegatee: ACCOUNT, delegator: SIGNER.publicKey() });
  });

  it("to --dry-run: does not submit", async () => {
    const votes = stubClient(VotesClient, { delegate: jest.fn() });
    const result = await runCli(["--dry-run", "delegate", "to", ACCOUNT, "--keypair", "unused"]);
    expect(votes.delegate).not.toHaveBeenCalled();
    expect(result.json()).toEqual({ action: "delegate.to", delegatee: ACCOUNT });
  });

  it("to: rejects a malformed delegatee before loading the keypair", async () => {
    const votes = stubClient(VotesClient, { delegate: jest.fn() });
    await expect(runCli(["delegate", "to", "GBAD", "--keypair", "/does/not/exist"])).rejects.toThrow(
      /delegatee must be a Stellar/,
    );
    expect(votes.delegate).not.toHaveBeenCalled();
  });

  it("show: reads delegatee and voting power", async () => {
    const votes = stubClient(VotesClient, {
      getDelegatee: jest.fn().mockResolvedValue(OTHER_ACCOUNT),
      getVotes: jest.fn().mockResolvedValue(1_000n),
    });

    const result = await runCli(["delegate", "show", ACCOUNT]);

    expect(votes.getDelegatee).toHaveBeenCalledWith(ACCOUNT);
    expect(votes.getVotes).toHaveBeenCalledWith(ACCOUNT);
    expect(result.json()).toEqual({ address: ACCOUNT, delegatee: OTHER_ACCOUNT, votingPower: "1000" });
  });

  it("show: --human prints key: value lines", async () => {
    stubClient(VotesClient, {
      getDelegatee: jest.fn().mockResolvedValue(null),
      getVotes: jest.fn().mockResolvedValue(3n),
    });
    const result = await runCli(["--human", "delegate", "show", ACCOUNT]);
    expect(result.stdout).toBe(`address: ${ACCOUNT}\ndelegatee: null\nvotingPower: 3`);
  });
});

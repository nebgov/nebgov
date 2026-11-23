import {
  readGovernorConfig,
  readGuardianCouncilConfig,
  readIndexerUrl,
} from "../nebgov-env";

const REQUIRED_ADDRESSES = {
  NEXT_PUBLIC_GOVERNOR_ADDRESS: "CGOVERNOR",
  NEXT_PUBLIC_TIMELOCK_ADDRESS: "CTIMELOCK",
  NEXT_PUBLIC_VOTES_ADDRESS: "CVOTES",
};

function clearNextPublicEnv() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_")) delete process.env[key];
  }
}

describe("readGovernorConfig", () => {
  beforeEach(clearNextPublicEnv);

  it.each(Object.keys(REQUIRED_ADDRESSES))("returns null when %s is missing", (missing) => {
    for (const [key, value] of Object.entries(REQUIRED_ADDRESSES)) {
      if (key !== missing) process.env[key] = value;
    }
    expect(readGovernorConfig()).toBeNull();
  });

  it("returns null when a required address is an empty string", () => {
    Object.assign(process.env, REQUIRED_ADDRESSES, { NEXT_PUBLIC_VOTES_ADDRESS: "" });
    expect(readGovernorConfig()).toBeNull();
  });

  it("builds the required config with testnet and the default backend URL", () => {
    Object.assign(process.env, REQUIRED_ADDRESSES);
    expect(readGovernorConfig()).toEqual({
      governorAddress: "CGOVERNOR",
      timelockAddress: "CTIMELOCK",
      votesAddress: "CVOTES",
      network: "testnet",
      backendUrl: "http://localhost:3001",
    });
  });

  it("strips trailing slashes from the backend URL", () => {
    Object.assign(process.env, REQUIRED_ADDRESSES, {
      NEXT_PUBLIC_BACKEND_URL: "https://api.example.test///",
    });
    expect(readGovernorConfig()?.backendUrl).toBe("https://api.example.test");
  });

  it("includes optional addresses and rpcUrl only when they are set", () => {
    Object.assign(process.env, REQUIRED_ADDRESSES, {
      NEXT_PUBLIC_NETWORK: "mainnet",
      NEXT_PUBLIC_RPC_URL: "https://rpc.example.test",
      NEXT_PUBLIC_CO_SPONSORSHIP_ADDRESS: "CCOSPONSOR",
      NEXT_PUBLIC_OPTIMISTIC_GOVERNOR_ADDRESS: "COPTIMISTIC",
    });

    const config = readGovernorConfig();
    expect(config).toMatchObject({
      network: "mainnet",
      rpcUrl: "https://rpc.example.test",
      coSponsorshipAddress: "CCOSPONSOR",
      optimisticGovernorAddress: "COPTIMISTIC",
    });
    expect(config).not.toHaveProperty("signalAnchorAddress");
    expect(config).not.toHaveProperty("convictionVotingAddress");
  });

  it("omits optional values that are present but empty", () => {
    Object.assign(process.env, REQUIRED_ADDRESSES, {
      NEXT_PUBLIC_RPC_URL: "",
      NEXT_PUBLIC_PROPOSAL_BONDS_ADDRESS: "",
    });

    const config = readGovernorConfig();
    expect(config).not.toHaveProperty("rpcUrl");
    expect(config).not.toHaveProperty("proposalBondsAddress");
  });

  it("falls back to testnet when NEXT_PUBLIC_NETWORK is empty", () => {
    Object.assign(process.env, REQUIRED_ADDRESSES, { NEXT_PUBLIC_NETWORK: "" });
    expect(readGovernorConfig()?.network).toBe("testnet");
  });
});

describe("readIndexerUrl", () => {
  beforeEach(clearNextPublicEnv);

  it("returns null when the indexer URL is not configured", () => {
    expect(readIndexerUrl()).toBeNull();
  });

  it("returns the configured indexer URL", () => {
    process.env.NEXT_PUBLIC_INDEXER_URL = "https://indexer.example.test";
    expect(readIndexerUrl()).toBe("https://indexer.example.test");
  });

  it("returns an empty string when set to empty, so callers must check truthiness", () => {
    process.env.NEXT_PUBLIC_INDEXER_URL = "";
    expect(readIndexerUrl()).toBe("");
  });
});

describe("readGuardianCouncilConfig", () => {
  beforeEach(clearNextPublicEnv);

  it("returns null when the council address is missing, even with a simulation account", () => {
    process.env.NEXT_PUBLIC_SIMULATION_ACCOUNT = "GENV";
    expect(readGuardianCouncilConfig("GWALLET")).toBeNull();
  });

  it("builds the config on testnet with no simulation account by default", () => {
    process.env.NEXT_PUBLIC_GUARDIAN_COUNCIL_ADDRESS = "CCOUNCIL";
    expect(readGuardianCouncilConfig()).toEqual({
      guardianCouncilAddress: "CCOUNCIL",
      network: "testnet",
    });
  });

  it("includes the RPC URL when configured", () => {
    process.env.NEXT_PUBLIC_GUARDIAN_COUNCIL_ADDRESS = "CCOUNCIL";
    process.env.NEXT_PUBLIC_RPC_URL = "https://rpc.example.test";
    expect(readGuardianCouncilConfig()).toMatchObject({ rpcUrl: "https://rpc.example.test" });
  });

  it("prefers the connected wallet over the env simulation account", () => {
    process.env.NEXT_PUBLIC_GUARDIAN_COUNCIL_ADDRESS = "CCOUNCIL";
    process.env.NEXT_PUBLIC_SIMULATION_ACCOUNT = "GENV";
    expect(readGuardianCouncilConfig("GWALLET")).toMatchObject({ simulationAccount: "GWALLET" });
  });

  it("falls back to the env simulation account when no wallet is connected", () => {
    process.env.NEXT_PUBLIC_GUARDIAN_COUNCIL_ADDRESS = "CCOUNCIL";
    process.env.NEXT_PUBLIC_SIMULATION_ACCOUNT = "GENV";
    expect(readGuardianCouncilConfig(null)).toMatchObject({ simulationAccount: "GENV" });
    expect(readGuardianCouncilConfig("")).toMatchObject({ simulationAccount: "GENV" });
  });

  it("omits the simulation account when neither source provides one", () => {
    process.env.NEXT_PUBLIC_GUARDIAN_COUNCIL_ADDRESS = "CCOUNCIL";
    expect(readGuardianCouncilConfig(null)).not.toHaveProperty("simulationAccount");
  });
});

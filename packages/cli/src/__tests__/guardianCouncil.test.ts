jest.mock("@nebgov/sdk", () => jest.requireActual("./sdkMock").mockSdk());
import { GuardianCouncilClient } from "@nebgov/sdk";
import { stubClient } from "./sdkMock";
import {
  BASE_CONFIG,
  SIGNER,
  ACCOUNT,
  OTHER_ACCOUNT,
  contractAddress,
  runCli,
  useCleanEnvironment,
  writeKeypairFile,
} from "./helpers";
useCleanEnvironment();
const address = contractAddress(50);
const config = {
  ...BASE_CONFIG,
  guardianCouncilAddress: address,
  defaultAccount: ACCOUNT,
};
it.each([
  ["Pause", [], { tag: "Pause" }],
  ["Unpause", [], { tag: "Unpause" }],
  [
    "CancelActive",
    ["--proposal-id", "18446744073709551615"],
    { tag: "CancelActive", proposalId: 18446744073709551615n },
  ],
  [
    "CancelQueued",
    ["--proposal-id", "4"],
    { tag: "CancelQueued", proposalId: 4n },
  ],
  [
    "RotateMember",
    ["--old", ACCOUNT, "--new", OTHER_ACCOUNT],
    { tag: "RotateMember", old: ACCOUNT, new: OTHER_ACCOUNT },
  ],
  ["SetThreshold", ["--threshold", "2"], { tag: "SetThreshold", threshold: 2 }],
])("proposes %s", async (tag, args, action) => {
  const client = stubClient(GuardianCouncilClient, {
    proposeAction: jest.fn().mockResolvedValue(3n),
  });
  const result = await runCli(
    [
      "guardian-council",
      "propose",
      tag as string,
      ...(args as string[]),
      "--keypair",
      writeKeypairFile(),
    ],
    config,
  );
  expect(client.proposeAction).toHaveBeenCalledWith(SIGNER, action);
  expect(result.json()).toEqual({ actionId: "3" });
});
it.each([
  ["approve", "approveAction"],
  ["revoke", "revokeApproval"],
  ["execute", "executeAction"],
])("%s signs and preserves u64 precision", async (command, method) => {
  const client = stubClient(GuardianCouncilClient, {
    [method]: jest.fn().mockResolvedValue("hash"),
  });
  await runCli(
    [
      "guardian-council",
      command,
      "18446744073709551615",
      "--keypair",
      writeKeypairFile(),
    ],
    config,
  );
  expect(client[method]).toHaveBeenCalledWith(SIGNER, 18446744073709551615n);
});
it("reads actions, members and threshold", async () => {
  const client = stubClient(GuardianCouncilClient, {
    getAction: jest.fn().mockResolvedValue({ id: 3n }),
    getMembers: jest.fn().mockResolvedValue([ACCOUNT]),
    getThreshold: jest.fn().mockResolvedValue(2),
  });
  expect(
    (await runCli(["guardian-council", "get", "3"], config)).json(),
  ).toEqual({ id: "3" });
  expect(client.getAction).toHaveBeenCalledWith(3n);
  expect(
    (await runCli(["guardian-council", "members"], config)).json(),
  ).toEqual([ACCOUNT]);
  expect((await runCli(["guardian-council", "threshold"], config)).json()).toBe(
    2,
  );
  expect(GuardianCouncilClient).toHaveBeenCalledWith(
    expect.objectContaining({
      guardianCouncilAddress: address,
      simulationAccount: ACCOUNT,
    }),
  );
});
it("requires config and supports the environment address", async () => {
  stubClient(GuardianCouncilClient, {
    getMembers: jest.fn().mockResolvedValue([]),
  });
  await expect(runCli(["guardian-council", "members"])).rejects.toThrow(
    "NEBGOV_GUARDIAN_COUNCIL_ADDRESS",
  );
  process.env.NEBGOV_GUARDIAN_COUNCIL_ADDRESS = address;
  await runCli(["guardian-council", "members"]);
});
it.each([
  ["get", "-1"],
  ["get", "18446744073709551616"],
  ["propose", "Unknown"],
])("rejects invalid %s %s", async (...args) => {
  await expect(
    runCli(
      [
        "guardian-council",
        ...args,
        ...(args[0] === "propose" ? ["--keypair", writeKeypairFile()] : []),
      ],
      config,
    ),
  ).rejects.toThrow();
  expect(GuardianCouncilClient).not.toHaveBeenCalled();
});
it("rejects zero thresholds", async () => {
  await expect(
    runCli(
      [
        "guardian-council",
        "propose",
        "SetThreshold",
        "--threshold",
        "0",
        "--keypair",
        writeKeypairFile(),
      ],
      config,
    ),
  ).rejects.toThrow("threshold must be at least 1");
});

it("dry-run never loads keys or submits transactions", async () => {
  const result = await runCli(
    [
      "--dry-run",
      "guardian-council",
      "propose",
      "Pause",
      "--keypair",
      "missing.json",
    ],
    config,
  );
  expect(result.json()).toEqual({
    action: "guardian-council.propose",
    guardianAction: { tag: "Pause" },
  });
  for (const command of ["approve", "revoke", "execute"]) {
    await runCli(
      [
        "--dry-run",
        "guardian-council",
        command,
        "1",
        "--keypair",
        "missing.json",
      ],
      config,
    );
  }
  expect(GuardianCouncilClient).not.toHaveBeenCalled();
});

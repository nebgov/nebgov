# `@nebgov/sdk`

TypeScript clients for the NebGov governance contracts on Stellar/Soroban.

## API documentation

The complete generated TypeDoc reference is published with every release:

- [Download the latest SDK API documentation](https://github.com/nebgov/nebgov/releases/latest/download/nebgov-sdk-api-docs.tar.gz)

After downloading, extract the archive and open `README.md` to browse the
generated reference.

## Installation

```sh
pnpm add @nebgov/sdk
```

## Basic usage

```ts
import { GovernorClient } from "@nebgov/sdk";

const client = new GovernorClient({
  governorAddress: "C...",
  timelockAddress: "C...",
  votesAddress: "C...",
  network: "testnet",
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 30_000,
  },
});
```

The legacy top-level `maxAttempts` and `baseDelayMs` settings remain supported,
but new integrations should use the `retry` object.

## Guardian Council

```typescript
import { GuardianCouncilClient } from "@nebgov/sdk";

const council = new GuardianCouncilClient({
  guardianCouncilAddress: "C...",
  network: "testnet",
  simulationAccount: "G...", // funded public account for read-only views
});
const actionId = await council.proposeAction(memberKeypair, { tag: "Pause" });
await council.approveAction(otherMemberKeypair, actionId);
await council.executeAction(feePayerKeypair, actionId);
const action = await council.getAction(actionId);
```

`initialize`, `revokeApproval`, `getMembers`, `getThreshold`, and `getGovernor`
complete the contract interface. Action and proposal IDs use `bigint` to preserve
u64 precision. `GuardianAction` supports `Pause`, `Unpause`, `CancelActive` and
`CancelQueued` (with `proposalId`), `RotateMember` (with `old` and `new` addresses),
and `SetThreshold` (with `threshold`). `encodeGuardianAction` and
`decodeGuardianAction` convert between these typed actions and Soroban values.
Proposing automatically approves; execution requires sufficient current members'
approvals and an unexpired action. Transaction methods return a hash, except
`proposeAction`, which returns the new action ID.

# Proposal Bonds

## Overview

The **Proposal Bonds** feature (`contracts/proposal-bonds`) enables governance systems to require proposers to post refundable bonds before creating proposals. This mechanism:

- **Prevents spam** by increasing the cost for low-quality proposals
- **Aligns incentives** by penalizing malicious or frivolous governance participation
- **Refunds participation** by returning bonds when proposals succeed or are fairly rejected
- **Supports slashing** by allowing the DAO to slash (confiscate) bonds in response to proposal violations

## How It Works

### Proposal Lifecycle with Bonds

```
Proposer posts bond → Proposal created → Voting occurs → Execution or cancellation
                          ↓
                    Governance decides
                    ↓
              Bond refunded or slashed
```

### Key Concepts

**Bond Amount**: The required amount of governance tokens (or other approved collateral) that a proposer must lock before creating a proposal. This is configurable per governance instance.

**Bond Refund**: Bonds are automatically returned to the proposer when:
- The proposal succeeds and is executed
- The proposal is defeated but was not frivolous (standard rejection)

**Bond Slashing**: Bonds can be slashed (confiscated) by governance when:
- A proposal violates community standards
- The proposer engages in bad-faith behavior
- Governance explicitly votes to slash the bond

### Smart Contract Interface

The proposal-bonds contract acts as a **bond escrow** between the proposer and the governance system. It:

1. Accepts bond deposits from proposers
2. Holds bonds in escrow during the proposal lifecycle
3. Returns or slashes bonds based on proposal outcomes
4. Mirrors the governor contract's proposal types to track proposal state

## Integration with NebGov

### With Governor

The proposal-bonds contract integrates with the core governor contract:

```
Governor (proposal lifecycle)
    ↓
Proposal-Bonds (manages proposer bonds)
```

When a proposal is created, the proposer's bond is locked. When the proposal reaches a terminal state (executed, defeated, or cancelled), the bonds contract is notified to either refund or slash.

### Configuration

Each governance instance can configure:

- **Minimum bond amount** — the amount required per proposal
- **Bond asset** — which token serves as bond collateral
- **Slashing thresholds** — criteria for when bonds can be slashed

## Usage Example

### Creating a Proposal with a Bond (SDK)

```typescript
import { GovernorClient } from '@nebgov/sdk';

const client = new GovernorClient({
  rpc: stellarRpc,
  contractId: governorAddress,
});

// Propose with a bond requirement
const result = await client.propose({
  proposer: userAddress,
  description: 'Add liquidity to XLM/USDC pool',
  targets: [treasuryAddress],
  functionNames: ['transfer'],
  calldatas: [calldata],
  bondAmount: 1000n, // Must post 1000 tokens as bond
});
```

### Refunding Bonds

Bonds are refunded automatically when proposals reach terminal states. The governance system can optionally implement additional logic to:

- Refund at different rates based on proposal performance
- Donate slashed bonds to a community fund
- Use slashing as a penalty mechanism

## Security Considerations

### Attack Vectors and Mitigations

**Sybil Attacks**: Proposal bonds increase the cost of launching many low-quality proposals, reducing the feasibility of coordination attacks.

**Bond Liquidity**: If bond amounts are too high, honest proposers may struggle to participate. Governance should tune bonds to balance participation and protection.

**Griefing**: An attacker could post valid proposals and accept slashing. Governance should reserve slashing for genuine violations, not disagreements.

## Related Features

- **[Conviction Voting](./conviction-voting.md)** — Combines with proposal bonds to create multi-track governance
- **[Governor](./architecture.md#proposal-lifecycle)** — Core proposal lifecycle that bonds integrate with
- **[Treasury](./architecture.md#treasury)** — Often stores slashed bonds or refund budgets

## See Also

- Smart contract: `contracts/proposal-bonds`
- Deployment guide: [docs/deployment.md](./deployment.md)
- Parameter tuning: [docs/parameter-guide.md](./parameter-guide.md)

# Conviction Voting

## Overview

The **Conviction Voting** feature (`contracts/conviction-voting`) implements a **self-executing alternative governance track** where proposals automatically execute when their conviction score exceeds a configurable threshold. This mechanism:

- **Rewards long-term commitment** by weighting votes based on how long participants stake on proposals
- **Reduces bureaucracy** by eliminating formal voting periods for consensus proposals
- **Prevents apathy** by requiring active participation (staking) rather than passive token holding
- **Scales governance** by handling routine or consensus decisions alongside formal voting

## How It Works

### Conviction Accumulation

```
Proposal created
    ↓
Supporters stake tokens on the proposal
    ↓
Conviction accumulates over time based on:
  - Amount of tokens staked
  - Duration of the stake
    ↓
Conviction reaches threshold? → Auto-execute
```

### Key Concepts

**Conviction**: A proposal's accumulated voting power, calculated as:

```
conviction = sum(stake_amount × time_staked)
```

Each staker contributes to conviction based on **how much they stake** and **how long they keep it staked**. Longer stakes count more, incentivizing genuine long-term support.

**Threshold**: A governance-configurable conviction level required for automatic execution. Once reached, the proposal executes immediately—no formal voting needed.

**Stake**: A record linking a participant, proposal, and amount of tokens staked. Participants can stake and unstake at any time.

**Self-Executing**: Unlike formal voting, conviction voting proposals execute immediately upon reaching the threshold, without waiting for a separate execution transaction.

## Proposal Lifecycle

A conviction voting proposal has these phases:

1. **Created** — Proposal is registered with initial metadata
2. **Staking** — Participants stake tokens to build conviction
3. **Accumulating** — Conviction grows over time
4. **Threshold Reached** — When conviction >= threshold, proposal auto-executes
5. **Executed** — Proposal's actions run on-chain
6. **Cancelled** — Proposal can be cancelled by admin or due to expiry

### Example Timeline

```
Day 1:  Proposal created, 3 supporters stake 1000 tokens each → conviction = 3000
Day 2:  Stakes held, conviction accumulates → conviction = 6000
Day 3:  Another supporter stakes 2000 → conviction = 10000
Day 4:  Conviction reaches 10000 threshold → Auto-execute
Day 5:  Proposal's target function runs, stakes are returned
```

## Integration with NebGov

### Multi-Track Governance

Conviction voting works alongside the standard governor:

```
Governor (formal voting)     Conviction Voting (consensus track)
    ↓                               ↓
Voting period              Staking/accumulation period
    ↓                               ↓
Execution after timelock   Execution (when threshold reached)
```

### Reading Voting Power

The conviction-voting contract reads current voting power from `contracts/token-votes`:

```rust
let votes = votes_client.get_votes(&staker_addr);
```

This prevents validators from staking more tokens than they hold.

## Usage Example

### Creating a Conviction Voting Proposal (SDK)

```typescript
import { ConvictionVotingClient } from '@nebgov/sdk';

const client = new ConvictionVotingClient({
  rpc: stellarRpc,
  contractId: convictionVotingAddress,
});

// Create a proposal
const result = await client.propose({
  proposer: userAddress,
  target: treasuryAddress,
  functionName: 'transfer',
  calldata: transferCalldata,
  requestedAmount: 500n, // Optional: amount being requested
  description: 'Fund developer education program',
});

const proposalId = result.proposalId;
```

### Staking on a Proposal

```typescript
// Participant stakes 1000 tokens on the proposal
await client.stake({
  staker: participantAddress,
  proposalId: proposalId,
  amount: 1000n,
});

// Conviction starts accumulating immediately
// After reaching the threshold, the proposal auto-executes
```

### Unstaking

```typescript
// Participant can unstake at any time
await client.unstake({
  staker: participantAddress,
  proposalId: proposalId,
});

// Tokens are returned to the staker
// (unless proposal already executed and consumed them)
```

## Configuration

Each governance instance can tune:

- **Conviction Threshold** — The conviction score required for auto-execution
- **Execution Delay** — Optional delay between reaching threshold and execution
- **Decay Factor** — How conviction decays if a proposal is not executed (optional)
- **Proposal Expiry** — How long a proposal can collect stakes before timing out

## Use Cases

### Consensus Decisions
Use conviction voting for proposals where community disagreement is unlikely:
- Routine treasury allocations
- Technical parameter adjustments
- Developer grants and bounties

### Delegated Governance
Conviction voting can reward engaged delegates:
- Delegates who stake longer accumulate more conviction
- Encourages delegates to commit to the DAO's success

### Reputation Systems
Combine conviction voting with reputation scoring:
- High-reputation participants' stakes may count more
- Newer participants' stakes may count less

## Security Considerations

### Attack Vectors and Mitigations

**Validator Centralization**: If a few large holders control most conviction, they effectively govern alone. Mitigation:
- Set conviction thresholds high enough to require broad participation
- Combine with delegation and co-sponsorship features
- Use proposal bonds to raise the cost of spam

**Timing Attacks**: An attacker might wait for low participation before creating a proposal. Mitigation:
- Set conviction thresholds relative to total voting power (e.g., 10% of total supply)
- Require minimum participation before execution

**Illiquidity**: Tokens staked in conviction voting are illiquid until unstaked. Participants cannot participate in other votes while funds are staked. Mitigation:
- Allow unstaking at any time (with optional cooldown)
- Use smaller stake amounts for frequent proposals
- Combine with liquid staking derivatives

**Apathy**: If governance doesn't actively promote conviction voting, participation may be too low. Mitigation:
- Publicize proposals and their conviction status
- Set up notifications when proposals approach thresholds
- Highlight voting as a concrete way to shape the DAO's direction

## Best Practices

1. **Start with Formal Voting** — Begin with the standard governor, then introduce conviction voting for routine decisions.

2. **Set Realistic Thresholds** — Thresholds should reflect community participation rates and governance culture.

3. **Publicize Proposals** — Ensure the community knows about open conviction voting proposals.

4. **Educate Participants** — Explain how conviction voting works and why it matters.

5. **Monitor Participation** — Track conviction accumulation and adjust thresholds if needed.

6. **Combine Features** — Use conviction voting with delegation (see [Split Delegation](./split-delegation.md)) to amplify engaged governance.

## Related Features

- **[Optimistic Governance](./optimistic-governance.md)** — Another alternative governance track based on challenge windows
- **[Proposal Bonds](./proposal-bonds.md)** — Complements conviction voting by increasing proposal costs
- **[Split Delegation](./split-delegation.md)** — Delegates can split voting power across multiple recipients
- **[Governor](./architecture.md)** — The formal voting system

## See Also

- Smart contract: `contracts/conviction-voting`
- Architecture: [docs/architecture.md](./architecture.md)
- Deployment guide: [docs/deployment.md](./deployment.md)
- Parameter tuning: [docs/parameter-guide.md](./parameter-guide.md)

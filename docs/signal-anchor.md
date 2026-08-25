# Signal Anchor: Gasless Signaling Polls

## Overview

The **Signal Anchor** feature (`contracts/signal-anchor`) enables **gasless off-chain signaling polls** with on-chain result anchoring. This mechanism:

- **Reduces gas costs** by running polls off-chain instead of on-chain
- **Enables rapid feedback** through low-cost off-chain voting mechanisms
- **Prevents tampering** by anchoring finalized results on-chain
- **Supports exploratory governance** by gathering community sentiment before formal proposals

## How It Works

### Off-Chain Signaling with On-Chain Anchoring

```
1. Backend creates signaling poll (off-chain)
   ↓
2. Users vote on poll (off-chain, no gas cost)
   ↓
3. Poll closes, votes are tallied (off-chain)
   ↓
4. Backend anchors finalized result on-chain
   ↓
5. Result is immutable; re-anchoring is prevented
```

### Key Concepts

**Signaling Poll**: A poll conducted entirely off-chain via the backend (`backend/src/signaling/`) that measures community sentiment on a topic—typically before formalizing as a proposal.

**Off-Chain Voting**: Poll participants vote via REST API calls without paying gas. Votes are stored in the backend database, not on-chain.

**Anchoring**: After a poll closes and results are finalized, the backend calls `anchor_result()` to store an immutable proof of the result on-chain.

**Anchor Record**: An immutable on-chain record containing:
- Poll ID
- Result hash (SHA-256 hash of the finalized vote tally)
- Anchoring ledger (when the result was anchored)
- Anchorer address (who submitted the anchor)

**Result Hash**: A cryptographic commitment to the poll results, preventing the backend from claiming different results after anchoring.

## Relationship to Formal Governance

Signaling polls are an **off-chain sentiment check** that precedes formal on-chain governance:

```
Signaling Poll       Formal Proposal        Execution
     ↓                    ↓                     ↓
Gather community   Token holders vote    Approved proposal
sentiment (no gas) with voting power     runs on-chain
                   (requires gas)
```

1. **Signaling Phase**: The community discusses a potential change and votes via signaling polls (gasless).
2. **Formal Phase**: If the signaling result is positive, a formal proposal is created (on-chain).
3. **Execution Phase**: Formal voting occurs; if approved, the proposal executes.

## Integration with NebGov

### Backend Signaling Service

The backend (`backend/src/signaling/`) manages:
- Poll creation and metadata
- Off-chain vote storage and tallying
- Result anchoring via the signal-anchor contract

### Signal Anchor Contract

The on-chain contract stores:
- Result anchors (poll_id → anchor record)
- Admin functions for governance-controlled updates
- TTL management to prevent data archival

## Usage Example

### Creating a Signaling Poll (Backend)

```typescript
// Backend creates poll via REST API
const poll = await signaling.createPoll({
  title: 'Should we allocate 5000 XLM to marketing?',
  description: 'Vote on budget allocation...',
  options: [
    'Yes, full allocation',
    'Yes, half allocation',
    'No, reject budget',
  ],
  duration: 7 * 24 * 60 * 60, // 7 days
});
```

### Voting (User)

```typescript
// User votes via REST API (gasless)
const vote = await signaling.vote({
  pollId: poll.id,
  userAddress: userAddress,
  optionIndex: 0, // Vote for "Yes, full allocation"
});

// No gas costs — vote is stored off-chain
```

### Anchoring Results (Backend)

```typescript
// After poll closes, backend anchors finalized results
const resultHash = crypto.hash(JSON.stringify(results));

const anchor = await signalAnchorClient.anchor_result({
  anchorer: backendAdminAddress,
  pollId: poll.id,
  resultHash: resultHash,
});

// Result is now immutable on-chain
```

### Verifying Results (Indexer / Frontend)

```typescript
// Read anchored result from on-chain
const anchor = await signalAnchorClient.get_anchor(pollId);

// Verify result hash matches backend tally
if (anchor.resultHash === backendCalculatedHash) {
  console.log('Results verified and immutable');
}
```

## Workflow: From Signaling to Formal Governance

### Example: Budget Allocation Decision

1. **Signaling Phase** (Days 1-7)
   - Backend creates poll: "Allocate 5000 XLM to marketing?"
   - Community votes off-chain (gasless)
   - Poll closes; 78% vote "yes"

2. **Anchoring** (End of Day 7)
   - Backend calls `anchor_result()` on-chain
   - Result hash is stored immutably
   - Indexer records the anchor

3. **Formal Proposal** (Day 8)
   - Based on strong signaling, a proposer creates a formal proposal
   - Proposal description references the signaling poll and its anchor

4. **Formal Voting** (Days 8-22)
   - Token holders vote using voting power (requires gas)
   - Formal voting period closes

5. **Execution** (Day 23+)
   - If approved, the proposal queues in timelock
   - After timelock expires, anyone can execute
   - Marketing budget is allocated

## Configuration

Each governance instance can tune:

- **Admin Address** — Who can anchor results (usually the backend service)
- **Anchor TTL** — How long anchors are kept on-chain (typically ~1 year)
- **Poll Metadata** — Off-chain storage of poll details (backend handles this)

## Security Considerations

### Attack Vectors and Mitigations

**Backend Compromise**: If the backend is compromised, an attacker could:
- Create fake polls
- Claim false vote tallies
- Anchor manipulated results

**Mitigations**:
- Keep backend admin keys in secure cold storage (hardware wallet or secret management)
- Only the admin can call `anchor_result()`, limiting who can submit anchors
- Publish poll metadata and vote counts off-chain for public verification
- Use multi-sig admin accounts for critical governance decisions

**Double Anchoring**: An attacker tries to anchor different results for the same poll.

**Mitigation**: The contract prevents double anchoring; only the first anchor is accepted. Subsequent attempts to anchor the same poll are rejected.

**Vote Manipulation (Off-Chain)**: If an attacker compromises backend vote storage, they could change votes before anchoring.

**Mitigations**:
- Implement cryptographic signatures for each vote
- Store vote logs immutably (e.g., in a blockchain or append-only database)
- Use zero-knowledge proofs if votes must remain private

**Coordination with On-Chain Voting**: If off-chain signaling weights differ from on-chain voting power, stakeholders might double-vote in both systems.

**Mitigation**: Signaling polls should be **advisory only**. Final decisions still require formal on-chain voting by token holders.

## Best Practices

1. **Use for Sentiment Checks** — Signaling polls should guide formal proposals, not replace them.

2. **Require Formal Voting** — Never execute proposals based solely on signaling results. Always follow with formal token-holder voting.

3. **Publicize Anchors** — After anchoring, publish the result hash and anchoring proof so the community can verify.

4. **Audit Off-Chain Logic** — Ensure the backend voting and tallying logic is audited and transparent.

5. **Multi-Sig Admin** — For critical governance, use a multi-sig wallet as the admin address.

6. **Combine with Proposals** — Link formal proposals to their signaling poll anchors for full traceability.

## Related Features

- **[Governor](./architecture.md)** — Formal proposal and voting system
- **[Proposal Bonds](./proposal-bonds.md)** — Adds cost to formal proposals
- **[Delegation](./split-delegation.md)** — Token holders can delegate voting power for formal voting

## See Also

- Smart contract: `contracts/signal-anchor`
- Backend signaling service: `backend/src/signaling/`
- Deployment guide: [docs/deployment.md](./deployment.md)
- Troubleshooting: [docs/troubleshooting.md](./troubleshooting.md)

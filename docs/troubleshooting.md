# Troubleshooting Guide

Common errors when interacting with NebGov on Stellar, along with their causes and fixes.

---

## Table of Contents

- [RPC Errors](#rpc-errors)
- [Wallet Errors](#wallet-errors)
- [Transaction Errors](#transaction-errors)
- [Contract Errors](#contract-errors)
- [Voting and Proposals](#voting-and-proposals)
- [Liquidity Contract Errors](#liquidity-contract-errors)
- [Proposal Bonds Errors](#proposal-bonds-errors)
- [Optimistic Governance Errors](#optimistic-governance-errors)
- [Conviction Voting Errors](#conviction-voting-errors)
- [Treasury Strategies Errors](#treasury-strategies-errors)
- [Signaling Errors](#signaling-errors)
- [FAQ](#faq)

---

## RPC Errors

### `Error: Simulation failed: HostError`

**Cause:** The contract invocation failed during simulation. Common reasons: wrong function name, incorrect argument types, or the contract is not deployed at the configured address.

**Fix:**
1. Verify the function name matches the contract ABI exactly (case-sensitive).
2. Check that all argument types are correct (e.g., `u32` vs `i128`, `Address` vs `String`).
3. Confirm `NEXT_PUBLIC_GOVERNOR_ADDRESS` in your `.env` points to a deployed contract on the correct network.
4. Run the simulation manually with `stellar contract invoke --simulate-only` to inspect the full error.

---

### `RPC connection refused` / `Failed to fetch`

**Cause:** The app cannot reach the Stellar RPC endpoint. The `NEXT_PUBLIC_RPC_URL` environment variable is missing or points to the wrong host.

**Fix:**
1. Open your `.env` (or `.env.local`) and verify `NEXT_PUBLIC_RPC_URL`.
   - Testnet: `https://soroban-testnet.stellar.org`
   - Futurenet: `https://rpc-futurenet.stellar.org`
   - Mainnet: `https://soroban-mainnet.stellar.org`
2. Restart the dev server after changing `.env`.
3. Check that your firewall or VPN is not blocking outbound HTTPS to port 443.

---

### `Error: Network mismatch`

**Cause:** The wallet is connected to a different Stellar network than the one the app targets.

**Fix:**
1. In your wallet (Freighter, Lobstr, etc.), switch to the network specified in `NEXT_PUBLIC_NETWORK_PASSPHRASE`.
2. The passphrase values are:
   - Testnet: `Test SDF Network ; September 2015`
   - Mainnet: `Public Global Stellar Network ; September 2015`

---

## Wallet Errors

### `Wallet not connected` / `No wallet found`

**Cause:** `WalletKitProvider` is not wrapping the component tree, or the provider was initialized after the component mounted.

**Fix:**
1. Ensure `<WalletKitProvider>` wraps your root layout in `app/layout.tsx` (or equivalent).
2. Do not conditionally render the provider — it must wrap the tree unconditionally.
3. If using `useWalletKit()`, confirm you are inside a component that is a descendant of the provider.

---

### `User declined the transaction`

**Cause:** The user cancelled the signing prompt in their wallet extension.

**Fix:** This is expected behavior. Show a non-blocking notification and allow the user to retry. Do not treat this as an application error.

---

### `PublicKey is not valid`

**Cause:** The wallet returned an empty or malformed public key. This can happen when the wallet is locked or has not yet granted permission to the dApp.

**Fix:**
1. Unlock your wallet and approve the site connection request.
2. Disconnect and reconnect via the Connect Wallet button.
3. If the issue persists, clear wallet permissions for the site and reconnect.

---

## Transaction Errors

### `Transaction rejected: insufficient fee`

**Cause:** The submitted fee is too low for current network conditions. The Stellar network uses a fee market during congestion.

**Fix:**
1. Use fee bumping: submit the transaction with a higher `base_fee` (e.g., 1 000 000 stroops during high congestion).
2. The SDK's `submitTransaction` helper retries with fee bumping automatically. Ensure you are on SDK v0.3.0+.
3. Monitor current base fees with `stellar ledger fetch --network testnet | jq .base_fee`.

---

### `Transaction expired`

**Cause:** The transaction's `timeBounds` window elapsed before it was included in a ledger. This often happens when the user delays signing.

**Fix:**
1. Increase `timeboundsSeconds` in the transaction builder (default is 30 s; try 120 s for complex multi-step flows).
2. Prompt the user to sign promptly after building the transaction.

---

### `Error: Ledger entry not found`

**Cause:** A persistent storage entry (e.g., a proposal or LP position) does not exist at the queried key. The contract may be on a different network than expected.

**Fix:**
1. Confirm `NEXT_PUBLIC_GOVERNOR_ADDRESS` and `NEXT_PUBLIC_TIMELOCK_ADDRESS` are set for the correct network.
2. Verify the data was written in a transaction that was successfully included in the ledger (not just simulated).

---

## Contract Errors

### VoteEscrow Errors

#### `Not initialized` (`VoteEscrowError::NotInitialized`)

**Cause:** The VoteEscrow contract has not been initialized. This occurs when calling contract methods before `initialize()` is invoked.

**Fix:**
1. Ensure the deployment script has completed and called `initialize()` on the VoteEscrow contract.
2. Verify `VOTE_ESCROW_ADDRESS` in your `.env` points to a deployed and initialized contract.
3. Run `scripts/verify-deployment.sh` to check VoteEscrow initialization status.

---

#### `Invalid duration` (`VoteEscrowError::InvalidDuration`)

**Cause:** The lock duration is outside the allowed range. Lock duration must be between `min_lock_duration` and `max_lock_duration`.

**Fix:**
1. Query `min_lock_duration` and `max_lock_duration` from the contract.
2. Ensure `duration_ledgers` for `create_lock()` is within this range.
3. Typical ranges: minimum 1 ledger, maximum 52 weeks in ledgers (~2,700,000 on Stellar).

---

#### `Invalid amount` (`VoteEscrowError::InvalidAmount`)

**Cause:** The lock amount is zero or negative. VoteEscrow requires a positive token amount to lock.

**Fix:**
1. Ensure the amount being locked is greater than zero.
2. Account for token decimals when calculating amounts (e.g., 7 decimals = multiply by 10^7).

---

#### `Lock not found` (`VoteEscrowError::LockNotFound`)

**Cause:** No lock exists for the given address. Either no lock was created, or the address is incorrect.

**Fix:**
1. Call `create_lock()` to create a new lock before attempting to query or modify it.
2. Verify the wallet address matches the owner of the lock.
3. Use the same account that created the lock when querying or modifying it.

---

#### `Lock not matured` (`VoteEscrowError::LockNotMatured`)

**Cause:** The lock's `end_ledger` has not yet passed. Locks must mature before withdrawal.

**Fix:**
1. Query `get_lock()` to see the lock's `end_ledger`.
2. Wait until the current ledger sequence exceeds the `end_ledger` to withdraw.
3. Monitor the network: `stellar ledger fetch --network testnet | jq .sequence`.

---

#### `Lock already withdrawn` (`VoteEscrowError::LockAlreadyWithdrawn`)

**Cause:** The lock has already been withdrawn. Each lock can only be withdrawn once.

**Fix:**
1. Create a new lock if you wish to lock tokens again.
2. Check the lock's `withdrawn` field before attempting to withdraw.

---

#### `Invalid end ledger` (`VoteEscrowError::InvalidEndLedger`)

**Cause:** The computed `end_ledger` (start + duration) is invalid or has already passed.

**Fix:**
1. Ensure the lock duration is valid and not zero.
2. Check that the current ledger is not already past the intended `end_ledger`.

---

#### `Unauthorized` (`VoteEscrowError::Unauthorized`)

**Cause:** The caller is not authorized to perform this action. Some operations require admin privileges.

**Fix:**
1. Ensure the wallet address is authorized (admin or lock owner).
2. For admin-only operations, use the admin account configured during deployment.

---

#### `Arithmetic overflow` (`VoteEscrowError::ArithmeticOverflow`)

**Cause:** An internal calculation overflowed. This typically occurs with very large amounts or edge cases in voting power calculations.

**Fix:**
1. Reduce the lock amount or duration if possible.
2. Report this as a bug if using normal amounts; it indicates a contract issue.

---

### VotingRewards Errors

#### `Already initialized` (`VotingRewardsError::AlreadyInitialized`)

**Cause:** The VotingRewards contract has already been initialized. `initialize()` can only be called once.

**Fix:**
1. Verify the contract is already initialized by checking `total_pool()`.
2. If deploying fresh, use a new contract address.

---

#### `Not initialized` (`VotingRewardsError::NotInitialized`)

**Cause:** The VotingRewards contract has not been initialized yet.

**Fix:**
1. Ensure `initialize()` has been called after contract deployment.
2. Run `scripts/verify-deployment.sh` to confirm VotingRewards initialization.

---

#### `Not authorized` (`VotingRewardsError::NotAuthorized`)

**Cause:** The caller lacks the required permissions. This typically applies to admin-only operations.

**Fix:**
1. Use the admin account configured during deployment.
2. For claim operations, ensure the caller's address matches the one in the Merkle proof.

---

#### `Invalid epoch duration` (`VotingRewardsError::InvalidEpochDuration`)

**Cause:** The epoch duration is zero or invalid. Epochs must have positive duration.

**Fix:**
1. Pass a positive epoch duration (in ledgers) to `initialize()`.
2. Typical epoch durations: 1 week to 1 month of ledgers (~252,000 to 2,628,000 ledgers on Stellar).

---

#### `Epoch not found` (`VotingRewardsError::EpochNotFound`)

**Cause:** The specified epoch does not exist. The epoch number or state is incorrect.

**Fix:**
1. Query recent epochs with `get_epochs()`.
2. Verify the epoch number is within the range of finalized or active epochs.

---

#### `Epoch not ended` (`VotingRewardsError::EpochNotEnded`)

**Cause:** The epoch is still active. Operations requiring a closed epoch cannot proceed.

**Fix:**
1. Wait until the current ledger surpasses the epoch's end ledger.
2. Call `finalize_epoch()` only after the epoch has ended.

---

#### `Epoch already finalized` (`VotingRewardsError::EpochAlreadyFinalized`)

**Cause:** The epoch has already been finalized. Finalization is idempotent but unnecessary to repeat.

**Fix:**
1. Verify the epoch state before attempting to finalize again.
2. Proceed to the next operation (e.g., computing or submitting Merkle proofs).

---

#### `Epoch not finalized` (`VotingRewardsError::EpochNotFinalized`)

**Cause:** The epoch must be finalized before claims can be submitted. This ensures reward calculations are complete.

**Fix:**
1. Call `finalize_epoch()` first to compute the final reward distribution.
2. Wait for finalization to complete before submitting claims.

---

#### `Insufficient pool` (`VotingRewardsError::InsufficientPool`)

**Cause:** The reward pool has insufficient balance to pay the claim. Rewards may have already been partially claimed.

**Fix:**
1. Verify the total reward pool was funded correctly during epoch setup.
2. Check how much has already been claimed for this epoch.
3. If pool is exhausted, it indicates an issue with reward calculations or multiple claims.

---

#### `Invalid amount` (`VotingRewardsError::InvalidAmount`)

**Cause:** The claim amount is zero, negative, or exceeds the claimable amount for this address.

**Fix:**
1. Query the claimable amount for your address using `get_claimable()`.
2. Ensure the proof corresponds to a valid, non-zero reward for this epoch.

---

#### `Already claimed` (`VotingRewardsError::AlreadyClaimed`)

**Cause:** The address has already claimed rewards for this epoch. Each address can claim only once per epoch.

**Fix:**
1. Use a different address if you wish to claim again (e.g., for a different vote weight).
2. Check the claim status with `get_claim()` before submitting a claim.

---

#### `Invalid proof` (`VotingRewardsError::InvalidProof`)

**Cause:** The Merkle proof is invalid or does not match the epoch's Merkle root. This occurs when the proof was corrupted or computed incorrectly.

**Fix:**
1. Re-fetch the Merkle proof from the backend API (`GET /voting-rewards/proof?epoch=<EPOCH>&address=<ADDRESS>`).
2. Verify the proof is for the correct epoch and address.
3. Ensure the backend's Merkle root matches the contract's stored root for this epoch.

---

#### `Epoch overclaimed` (`VotingRewardsError::EpochOverclaimed`)

**Cause:** The total claimed amount exceeds the finalized rewards for this epoch. This indicates a calculation error or corrupted Merkle root.

**Fix:**
1. Report this as a critical bug; it suggests either backend miscalculation or a malicious proof.
2. Stop processing claims and investigate the Merkle tree computation.

---

### `Proposal not found` (`GovernorError::ProposalNotFound`)

**Cause:** The proposal ID does not exist in the governor contract. Either the wrong contract address is configured, or the proposal was never created on this network.

**Fix:**
1. Verify `NEXT_PUBLIC_GOVERNOR_ADDRESS` matches the deployed governor on the active network.
2. Confirm the proposal was created by checking the transaction that called `propose()`.

---

### `Not authorized` / `require_auth` failed

**Cause:** The caller's signature was not present in the transaction authorization envelope, or the wrong address was passed as the `caller` argument.

**Fix:**
1. Ensure the wallet's public key matches the address passed to privileged functions (e.g., `governor`, `admin`, `provider`).
2. When constructing the transaction, call `addSignatureBase64` or equivalent for each required signer before submitting.

---

### `Pool not found` (`LiquidityError::PoolNotFound`)

**Cause:** No liquidity pool exists for the given outcome pair, or the pair was registered under a different token ordering.

**Fix:**
1. Confirm `create_pool` and `initialize_pool` were called by the governor for this outcome pair.
2. Outcome pair ordering is canonical (smaller id first) — querying `(1, 2)` and `(2, 1)` resolve to the same pool.
3. Check that the `NEXT_PUBLIC_LIQUIDITY_ADDRESS` env var points to the correct contract.

---

## Voting and Proposals

### `Vote period not started`

**Cause:** `cast_vote` was called before the proposal's `start_ledger`. The proposal is in `Pending` state.

**Fix:**
1. Call `governor.state(proposal_id)` to get the current state.
2. Read `proposal.start_ledger` and wait until the current ledger sequence surpasses it.
3. The UI should disable the Vote button until the proposal is `Active`.

---

### `Already voted` (`GovernorError::AlreadyVoted`)

**Cause:** The wallet address has already cast a vote for this proposal. The contract rejects duplicate votes.

**Fix:** Each address may vote only once per proposal. Show the user their existing vote choice instead of the voting form.

---

### `Insufficient voting power`

**Cause:** The user has no delegated voting power at the proposal's snapshot ledger. Tokens must be delegated (self-delegated or to another account) before the proposal was created.

**Fix:**
1. Call `votes.delegate(account, account)` to self-delegate before the next proposal is created.
2. Wrapping tokens via `token_votes.wrap(amount)` and then delegating grants voting power.
3. Voting power is snapshotted at `proposal.start_ledger - 1`; delegation after that point does not count for this proposal.

---

### `Proposal not in voting period` (`GovernorError::ProposalNotActive`)

**Cause:** `cast_vote` was called when the proposal is in `Succeeded`, `Defeated`, `Queued`, `Executed`, or `Expired` state.

**Fix:** Check `governor.state(proposal_id)` before casting a vote. Only `Active` proposals accept new votes.

---

### `Proposal threshold not met` (`GovernorError::ProposalThresholdNotMet`)

**Cause:** The proposer's voting power is below their effective proposal threshold. The effective threshold is the governor's flat `proposal_threshold` multiplied by the proposer's reputation multiplier, so it can be up to 2x the flat value. Repeated defeated, cancelled, or expired proposals raise it. The flat value shown in the governor settings is not the threshold this address must meet.

**Fix:**
1. Call `governor.get_effective_threshold(proposer)` to see the threshold this address must meet, and compare it with the flat `proposal_threshold` in the governor settings.
2. Call `governor.get_proposer_reputation(proposer)` to see the score and `threshold_multiplier_bps`.
3. Acquire or delegate more voting power (see `Insufficient voting power`), or have other holders co-sponsor the proposal ([co-sponsorship.md](./co-sponsorship.md)).
4. The score recovers as proposals succeed and are executed. It also decays toward zero over time. Call `governor.apply_reputation_decay(proposer)` to apply decay to a stale record. See [parameter-guide.md](./parameter-guide.md#proposer-reputation) for the scoring rules.

---

## Liquidity Contract Errors

### `Imbalanced deposit: amount_b below required ratio`

**Cause:** A subsequent deposit to a pool provided a `amount_b` that is less than the proportional amount required by the current reserve ratio. This prevents price manipulation.

**Fix:**
1. Fetch the current pool reserves with `liquidity.get_pool(outcome_a, outcome_b)`.
2. Compute `required_b = amount_a * reserve_b / reserve_a` before calling `add_liquidity`.
3. Pass `required_b` (or a value greater than it) as `amount_b`.

---

### `Below minimum liquidity`

**Cause:** The deposit amount is below `MIN_LIQUIDITY` (1 000 units). Tiny deposits are rejected to prevent dust griefing.

**Fix:** Ensure both `amount_a` and the computed `required_b` are at least 1 000 units.

---

### `Slippage exceeded`

**Cause:** The swap output `amount_out` after fees is less than the caller's `min_amount_out`. The pool moved between simulation and execution.

**Fix:**
1. Re-simulate the swap immediately before submitting to get the latest output.
2. Add a slippage tolerance (e.g., 0.5%) to `min_amount_out`: `min_amount_out = simulated_out * 995 / 1000`.

---

## Proposal Bonds Errors

#### `Already initialized` (`ProposalBondsError::AlreadyInitialized`)

**Cause:** `initialize()` was called on a contract that has already been initialized. The `Admin` key is already set in instance storage.

**Fix:**
1. Verify `PROPOSAL_BONDS_ADDRESS` in your `.env` points to the correct, freshly deployed contract.
2. If deploying from scratch, use a new contract address.
3. Run `scripts/verify-deployment.sh` to confirm initialization status.

---

#### `Not initialized` (`ProposalBondsError::NotInitialized`)

**Cause:** A contract method was called before `initialize()` was invoked. Instance storage has no `Admin`, `BondToken`, `BondAmount`, or `Governor` key yet.

**Fix:**
1. Ensure the deployment script completed successfully and called `initialize()` on the proposal-bonds contract.
2. Verify `PROPOSAL_BONDS_ADDRESS` points to the deployed and initialized contract on the active network.

---

#### `Bond already locked` (`ProposalBondsError::BondAlreadyLocked`)

**Cause:** `lock_bond()` was called with a proposer and `description_hash` pair that already has a bond in storage. Other proposers may bond the same hash independently.

**Fix:**
1. Ensure `lock_bond()` is only called once per unique proposal `description_hash`.
2. Query `get_bond(proposer, description_hash)` before locking to check whether a bond already exists.
3. If re-proposing after a refund or slash, compute a new `description_hash` (e.g., by appending a nonce to the description).

---

#### `Bond not found` (`ProposalBondsError::BondNotFound`)

**Cause:** `refund_bond()` or `slash()` was called with a `description_hash` for which no bond record exists in persistent storage.

**Fix:**
1. Verify the proposer and `description_hash` match the original `lock_bond()` call (byte-for-byte identical).
2. Confirm `lock_bond()` was included in a successfully finalized ledger (not just simulated).
3. The bond record has a TTL of ~1,000,000 ledgers (~58 days). If the record has expired from storage, the bond cannot be refunded on-chain.

---

#### `Bond not locked` (`ProposalBondsError::BondNotLocked`)

**Cause:** `refund_bond()` or `slash()` was called on a bond that is already in state `Refunded` or `Slashed`. Each bond can only be refunded or slashed once.

**Fix:**
1. Call `get_bond(proposer, description_hash)` and inspect the `state` field before calling `refund_bond()` or `slash()`.
2. Only bonds with `state = Locked` can be refunded or slashed.

---

#### `Description hash mismatch` (`ProposalBondsError::DescriptionHashMismatch`)

**Cause:** During `refund_bond()`, the `description_hash` stored in the governor's proposal record does not match the `description_hash` used as the bond key. The bond and the proposal are not correlated.

**Fix:**
1. Ensure the same `description_hash` was passed to both `governor.propose()` and `proposal_bonds.lock_bond()`.
2. Re-derive the hash from the original proposal description using the same hashing method (SHA-256 of the UTF-8 description string).
3. Pass the correct `proposal_id` that corresponds to the bonded description.

---

#### `Proposal not terminal` (`ProposalBondsError::ProposalNotTerminal`)

**Cause:** `refund_bond()` was called while the correlated governor proposal is still in a non-terminal state (`Pending`, `Active`, `Queued`, or `Succeeded`). Refunds are only allowed once the proposal has fully concluded.

**Fix:**
1. Query `governor.state(proposal_id)` to check the current state.
2. Wait until the proposal reaches `Executed`, `Defeated`, `Expired`, or `Cancelled` before calling `refund_bond()`.
3. Note: `Queued` is intentionally not considered terminal. If a queued proposal's execution window closes without being executed, the `MaxLockLedgers` escape hatch will eventually allow refund regardless of state.

---

#### `Refund grace not elapsed` (`ProposalBondsError::RefundGraceNotElapsed`)

**Cause:** `refund_bond()` was called before the post-terminal grace window has elapsed. The grace period (measured from `proposal.end_ledger`) gives the community time to submit a `slash` governance proposal before the bond is returned.

**Fix:**
1. Call `get_settings()` to read the configured `refund_grace_ledgers` value.
2. Compute the earliest eligible refund ledger as `proposal.end_ledger + refund_grace_ledgers`.
3. Wait until the current ledger sequence exceeds that value before retrying `refund_bond()`.

---

#### `Not authorized` (`ProposalBondsError::NotAuthorized`)

**Cause:** `slash()` was called by an address that is not the configured governor contract, or `update_bond_amount()` was called by an address that is not the stored admin.

**Fix:**
1. `slash()` may only be invoked as the execution target of a passed governor proposal (i.e., the caller must be the governor contract address itself).
2. For `update_bond_amount()`, the caller must match the admin set during `initialize()`. Use the deployer key or the current admin address.

---

#### `Invalid bond amount` (`ProposalBondsError::InvalidBondAmount`)

**Cause:** `initialize()` or `update_bond_amount()` was called with a `bond_amount` of zero or a negative value. Bond amounts must be positive.

**Fix:**
1. Pass a positive `bond_amount` (in the bond token's smallest unit, accounting for decimals).
2. Typical bond amounts are expressed in whole token units multiplied by 10^7 (7-decimal Stellar tokens).

---

## Optimistic Governance Errors

#### `Already initialized` (`OptimisticGovernorError::AlreadyInitialized`)

**Cause:** `initialize()` was called on an already-initialized contract. The `Admin` key is present in instance storage.

**Fix:**
1. Verify `OPTIMISTIC_GOVERNOR_ADDRESS` points to a freshly deployed contract.
2. Use a new contract address for each governance deployment.

---

#### `Not initialized` (`OptimisticGovernorError::NotInitialized`)

**Cause:** A contract function was called before `initialize()` completed. Required instance keys (`Admin`, `VotesToken`, `ChallengeWindowLedgers`, `ObjectionThresholdBps`, `ProposerBondAmount`, `ProposerBondToken`) are absent.

**Fix:**
1. Ensure `initialize()` was included in the deployment and succeeded on-chain.
2. Verify `OPTIMISTIC_GOVERNOR_ADDRESS` in your `.env` is correct for the active network.

---

#### `Invalid configuration` (`OptimisticGovernorError::InvalidConfiguration`)

**Cause:** `initialize()` or `update_config()` was called with out-of-range parameters: `challenge_window_ledgers` is zero, `objection_threshold_bps` is zero or greater than 10 000, or `proposer_bond_amount` is negative.

**Fix:**
1. Set `challenge_window_ledgers` to at least 1 (typical values: 17 280–86 400 ledgers ≈ 1–5 days).
2. Set `objection_threshold_bps` between 1 and 10 000 (e.g., `500` = 5% of total supply).
3. Set `proposer_bond_amount` to 0 (disabled) or a positive value. Negative values are rejected.

---

#### `Invalid calldata` (`OptimisticGovernorError::InvalidCalldata`)

**Cause:** The `calldata` bytes passed to `propose()` or decoded during `execute()` are not valid XDR-encoded `Vec<Val>`. The bytes cannot be deserialized.

**Fix:**
1. Encode calldata using the Soroban SDK's XDR serializer: `Vec::<Val>::to_xdr(&env, &args)`.
2. Pass an empty `Bytes` (`Bytes::new(&env)`) for proposals that invoke a zero-argument function.
3. Re-derive the calldata from the SDK rather than constructing raw bytes manually.

---

#### `Proposal not found` (`OptimisticGovernorError::ProposalNotFound`)

**Cause:** The `proposal_id` passed to `object()`, `finalize()`, `execute()`, `cancel()`, or `get_proposal()` does not exist in persistent storage.

**Fix:**
1. Verify the `proposal_id` returned by the original `propose()` call.
2. Confirm `OPTIMISTIC_GOVERNOR_ADDRESS` is set to the correct contract for the active network.
3. Proposal records have a TTL of ~1,000,000 ledgers. Ensure the record has not expired.

---

#### `Not in challenge window` (`OptimisticGovernorError::NotInChallengeWindow`)

**Cause:** `object()` was called on a proposal that is no longer in the `ChallengeWindow` state (it is already `Objected`, `Passed`, `Executed`, or `Cancelled`).

**Fix:**
1. Call `get_proposal(proposal_id)` and inspect the `state` field.
2. Objections are only valid while a proposal is in state `ChallengeWindow`.

---

#### `Challenge window not elapsed` (`OptimisticGovernorError::ChallengeWindowNotElapsed`)

**Cause:** `finalize()` was called before the proposal's `challenge_end_ledger` has passed. The challenge window is still open.

**Fix:**
1. Call `get_proposal(proposal_id)` and check `challenge_end_ledger`.
2. Wait until `current_ledger >= challenge_end_ledger` before calling `finalize()`.
3. Monitor the current ledger sequence with `stellar ledger fetch --network testnet | jq .sequence`.

---

#### `Challenge window elapsed` (`OptimisticGovernorError::ChallengeWindowElapsed`)

**Cause:** `object()` was called after the proposal's `challenge_end_ledger` has already passed. The window for lodging objections is closed.

**Fix:**
1. Check `challenge_end_ledger` from `get_proposal(proposal_id)` before calling `object()`.
2. If the window has elapsed and the proposal has not been finalized yet, call `finalize()` to transition it to `Passed`.

---

#### `Already objected` (`OptimisticGovernorError::AlreadyObjected`)

**Cause:** The same address has already cast an objection for this proposal. Each address may object only once per proposal.

**Fix:** Each wallet can only object once. Show the user their existing objection rather than allowing a second submission.

---

#### `No voting power` (`OptimisticGovernorError::NoVotingPower`)

**Cause:** The objector had zero voting power at the proposal's `created_ledger` snapshot. Objection weight is read from historical records — tokens acquired after the proposal was created do not count.

**Fix:**
1. Ensure tokens were delegated (self-delegated or to another account) **before** the proposal's `created_ledger`.
2. Query `votes.get_past_votes(objector, proposal.created_ledger)` to verify historical power before submitting.

---

#### `Proposal objected` (`OptimisticGovernorError::ProposalObjected`)

**Cause:** An operation that requires a non-objected proposal was called on a proposal already in state `Objected`.

**Fix:**
1. Check `proposal.state` with `get_proposal(proposal_id)` before calling `finalize()` or `execute()`.
2. An objected proposal must be cancelled by the proposer or re-submitted as a new proposal.

---

#### `Proposal not passed` (`OptimisticGovernorError::ProposalNotPassed`)

**Cause:** `execute()` was called on a proposal that is not yet in the `Passed` state. The proposal may still be in `ChallengeWindow`, or it has been `Objected`, `Executed`, or `Cancelled`.

**Fix:**
1. Call `finalize(proposal_id)` first to transition a `ChallengeWindow` proposal to `Passed` (requires the challenge window to have elapsed).
2. Verify `proposal.state == Passed` with `get_proposal(proposal_id)` before calling `execute()`.

---

#### `Proposal already finalized` (`OptimisticGovernorError::ProposalAlreadyFinalized`)

**Cause:** `finalize()` was called on a proposal that is no longer in `ChallengeWindow` state — it has already been finalized to `Passed`, `Objected`, `Executed`, or `Cancelled`.

**Fix:**
1. Call `get_proposal(proposal_id)` to check the current state.
2. If the proposal is already `Passed`, proceed directly to `execute()`.

---

#### `Unauthorized` (`OptimisticGovernorError::Unauthorized`)

**Cause:** `cancel()` was called by an address that is not the proposal's `proposer`, or `update_config()` was called by an address that is not the stored admin.

**Fix:**
1. Only the original proposer may cancel their own optimistic proposal.
2. Only the admin set during `initialize()` may call `update_config()`.

---

#### `Arithmetic overflow` (`OptimisticGovernorError::ArithmeticOverflow`)

**Cause:** An internal checked arithmetic operation (e.g., proposal ID counter increment, objection vote accumulation, `challenge_end_ledger` calculation) overflowed.

**Fix:**
1. This should not occur under normal operating conditions. Report as a bug if it is triggered with normal input values.
2. If objection vote accumulation overflowed, it indicates total objection power exceeded `i128::MAX`, which is not practically possible.

---

#### `Proposal not cancellable` (`OptimisticGovernorError::ProposalNotCancellable`)

**Cause:** `cancel()` was called on a proposal that is in state `Passed`, `Executed`, or `Cancelled`. Only proposals in `ChallengeWindow` or `Objected` state can be cancelled.

**Fix:**
1. Check `proposal.state` with `get_proposal(proposal_id)` before calling `cancel()`.
2. A `Passed` proposal has already cleared the challenge window and cannot be cancelled; it can only be executed.

---

## Conviction Voting Errors

#### `Already initialized` (`ConvictionVotingError::AlreadyInitialized`)

**Cause:** `initialize()` was called on a conviction voting contract that has already been initialized.

**Fix:**
1. Verify `CONVICTION_VOTING_ADDRESS` in your `.env` points to a newly deployed contract.
2. Use a new contract address for each deployment.

---

#### `Not initialized` (`ConvictionVotingError::NotInitialized`)

**Cause:** A contract function was called before `initialize()` completed. Required instance keys (`Admin`, `VotesToken`, `DecayBps`, `MaxRatioBps`, `MinThresholdConviction`, `WeightBps`) are absent.

**Fix:**
1. Ensure `initialize()` succeeded on-chain during deployment.
2. Verify `CONVICTION_VOTING_ADDRESS` is set for the correct network.

---

#### `Invalid configuration` (`ConvictionVotingError::InvalidConfiguration`)

**Cause:** `initialize()` was called with out-of-range parameters: `decay_bps` is 0 or ≥ 10 000; `max_ratio_bps` is 0 or > 10 000; `min_threshold_conviction` is ≤ 0; `weight_bps` is 0 or > 10 000.

**Fix:**
1. Set `decay_bps` between 1 and 9 999 (e.g., `9 000` = 90% retention per ledger interval).
2. Set `max_ratio_bps` between 1 and 10 000 (e.g., `2 000` = a proposal may request up to 20% of supply).
3. Set `min_threshold_conviction` to a positive value.
4. Set `weight_bps` between 1 and 10 000.
5. Refer to [docs/conviction-voting.md](./conviction-voting.md) for typical parameter ranges.

---

#### `Invalid amount` (`ConvictionVotingError::InvalidAmount`)

**Cause:** `stake()` was called with `amount <= 0`, `create_proposal()` was called with `requested_amount < 0`, or `get_required_threshold()` was called with a negative `requested_amount`.

**Fix:**
1. Pass a positive stake amount to `stake()`.
2. Pass a non-negative `requested_amount` to `create_proposal()` (use 0 for a non-treasury proposal).

---

#### `Proposal not found` (`ConvictionVotingError::ProposalNotFound`)

**Cause:** The `proposal_id` passed to `stake()`, `checkpoint_conviction()`, `get_proposal()`, `cancel_proposal()`, or `get_stakes()` does not exist in persistent storage.

**Fix:**
1. Verify the `proposal_id` returned by the original `create_proposal()` call.
2. Confirm `CONVICTION_VOTING_ADDRESS` is set to the correct contract for the active network.

---

#### `Proposal closed` (`ConvictionVotingError::ProposalClosed`)

**Cause:** `stake()` or `cancel_proposal()` was called on a proposal that has already been executed or cancelled. No further staking or cancellation is allowed once a proposal is closed.

**Fix:**
1. Query `get_proposal(proposal_id)` and check `proposal.executed` and `proposal.cancelled` flags before acting.
2. To stake on active proposals only, filter on `!executed && !cancelled`.

---

#### `Insufficient voting power` (`ConvictionVotingError::InsufficientVotingPower`)

**Cause:** `stake()` was called with an `amount` greater than the staker's current live voting power (as returned by `get_votes(staker)`). Conviction voting uses live balances, not historical snapshots.

**Fix:**
1. Call `votes.get_votes(staker)` to read the current voting power before staking.
2. Ensure tokens are wrapped and delegated via `token_votes.wrap()` and `votes.delegate(account, account)`.
3. Do not stake more than the current delegated balance.

---

#### `Stake not found` (`ConvictionVotingError::StakeNotFound`)

**Cause:** `withdraw_stake()` was called for an address that has no active stake record (`StakeByStaker` key is absent in persistent storage).

**Fix:**
1. Verify the wallet address has previously called `stake()` and has an active stake.
2. Query the proposal's stake list with `get_stakes(proposal_id, 0, 100)` to confirm the staker's entry.

---

#### `Unauthorized` (`ConvictionVotingError::Unauthorized`)

**Cause:** `cancel_proposal()` was called by an address that is neither the proposal's `proposer` nor the module admin.

**Fix:**
1. Only the original proposer or the admin set during `initialize()` may cancel a proposal.
2. Verify the wallet address matches `proposal.proposer` or the configured admin.

---

#### `Arithmetic overflow` (`ConvictionVotingError::ArithmeticOverflow`)

**Cause:** A checked arithmetic operation in conviction accumulation, threshold calculation, or stake totaling overflowed `i128`. This can happen with extremely large token supplies or very long periods without a conviction checkpoint.

**Fix:**
1. Call `checkpoint_conviction(proposal_id)` more frequently to reset the accumulation window and avoid overflow from large elapsed-ledger exponentiation.
2. Report as a bug if it occurs with normal supply and parameter values.

---

#### `Invalid calldata` (`ConvictionVotingError::InvalidCalldata`)

**Cause:** The `calldata` bytes passed to `create_proposal()` or decoded during `checkpoint_conviction()` are not valid XDR-encoded `Vec<Val>`.

**Fix:**
1. Encode calldata using the Soroban SDK's XDR serializer: `Vec::<Val>::to_xdr(&env, &args)`.
2. Pass an empty `Bytes` (`Bytes::new(&env)`) for proposals that call a zero-argument function.

---

## Treasury Strategies Errors

#### `Already initialized` (`TreasuryStrategiesError::AlreadyInitialized`)

**Cause:** `initialize()` was called on a treasury strategies contract that has already been initialized. The `Admin` key already exists in instance storage.

**Fix:**
1. Verify `TREASURY_STRATEGIES_ADDRESS` in your `.env` points to a newly deployed contract.
2. Use a new contract address for each deployment.

---

#### `Not admin` (`TreasuryStrategiesError::NotAdmin`)

**Cause:** `register_strategy()` or `deactivate_strategy()` was called with an `admin` address that does not match the one stored during `initialize()`.

**Fix:**
1. Use the admin address configured during deployment for all admin-gated operations.
2. Admin-only operations are `register_strategy()` and `deactivate_strategy()`.

---

#### `Not treasury` (`TreasuryStrategiesError::NotTreasury`)

**Cause:** `deposit()` or `request_withdrawal()` was called by an address that is not the configured treasury. Only the treasury multisig may move funds into or out of this contract.

**Fix:**
1. Ensure the caller is the treasury contract address set during `initialize()`.
2. Verify `TREASURY_ADDRESS` is configured correctly in your deployment `.env`.

---

#### `Strategy not found` (`TreasuryStrategiesError::StrategyNotFound`)

**Cause:** `deactivate_strategy()`, `request_withdrawal()`, `claim_withdrawal()`, or `get_strategy()` was called with a `strategy_id` that does not exist in persistent storage.

**Fix:**
1. Use only `strategy_id` values returned by previous `register_strategy()` calls.
2. Strategy IDs are sequential integers starting at 1. Verify the correct ID is used.

---

#### `No active strategy` (`TreasuryStrategiesError::NoActiveStrategy`)

**Cause:** `deposit()` was called but no active strategy exists for the deposited token. Either no strategy has been registered for this token, or all registered strategies have been deactivated.

**Fix:**
1. Register at least one active strategy for the deposit token using `register_strategy()` before depositing.
2. If strategies were deactivated, reactivate one or register a new strategy.
3. Confirm the `token` address in the `deposit()` call matches the `token` used in `register_strategy()`.

---

#### `Allocation cap exceeded` (`TreasuryStrategiesError::AllocationCapExceeded`)

**Cause:** `deposit()` was called but all active strategies for this token are already at or above their `max_allocation_bps` cap relative to the total deposited balance. No strategy has room for the requested deposit amount.

**Fix:**
1. Register an additional strategy with a higher or unreached `max_allocation_bps`.
2. Increase the `max_allocation_bps` of an existing strategy by deactivating and re-registering it with a higher cap.
3. Reduce the deposit `amount` so it fits within an existing strategy's remaining capacity.

---

#### `Insufficient allocation` (`TreasuryStrategiesError::InsufficientAllocation`)

**Cause:** `request_withdrawal()` was called with an `amount` greater than the current allocation for the given `strategy_id`. You cannot withdraw more than what was deposited into that strategy.

**Fix:**
1. Call `get_allocation(strategy_id)` to read the current `allocation.amount`.
2. Request a withdrawal of at most `allocation.amount`.

---

#### `Withdrawal not found` (`TreasuryStrategiesError::WithdrawalNotFound`)

**Cause:** `claim_withdrawal()` was called with a `withdrawal_id` that does not exist in persistent storage.

**Fix:**
1. Use only `withdrawal_id` values returned by a previous `request_withdrawal()` call.
2. Withdrawal IDs are sequential integers starting at 1. Verify the correct ID is used.

---

#### `Withdrawal already claimed` (`TreasuryStrategiesError::WithdrawalAlreadyClaimed`)

**Cause:** `claim_withdrawal()` was called on a withdrawal request whose `claimed` flag is already `true`. Each withdrawal can only be claimed once.

**Fix:**
1. Check `withdrawal.claimed` by querying the withdrawal record before calling `claim_withdrawal()`.
2. If already claimed, the funds have already been returned to the treasury.

---

#### `Withdrawal not yet claimable` (`TreasuryStrategiesError::WithdrawalNotYetClaimable`)

**Cause:** `claim_withdrawal()` was called before the withdrawal's `claimable_ledger` has been reached. The strategy's `withdrawal_cooldown_ledgers` has not elapsed since the withdrawal request.

**Fix:**
1. Read `withdrawal.claimable_ledger` from the request record.
2. Wait until the current ledger sequence is ≥ `claimable_ledger` before calling `claim_withdrawal()`.
3. Monitor ledger progress with `stellar ledger fetch --network testnet | jq .sequence`.

---

#### `Invalid amount` (`TreasuryStrategiesError::InvalidAmount`)

**Cause:** `deposit()` or `request_withdrawal()` was called with an `amount` of zero or a negative value.

**Fix:**
1. Pass a positive `amount` to both `deposit()` and `request_withdrawal()`.
2. Account for token decimals: for 7-decimal tokens, 1 whole token = 10 000 000 units.

---

#### `Invalid bps` (`TreasuryStrategiesError::InvalidBps`)

**Cause:** `register_strategy()` was called with a `max_allocation_bps` greater than 10 000 (100%). A strategy cannot be allocated more than 100% of total deposited funds.

**Fix:**
1. Set `max_allocation_bps` between 1 and 10 000 (e.g., `5 000` = 50% of total balance).
2. The sum of all active strategies' caps is not enforced by the contract — it is the admin's responsibility to ensure allocations are coherent.

---

#### `Not initialized` (`TreasuryStrategiesError::NotInitialized`)

**Cause:** A function that requires instance storage (`Admin`, `Treasury`) was called before `initialize()` completed. This can also surface during `claim_withdrawal()` if the `Treasury` key has been corrupted or the contract was never initialized.

**Fix:**
1. Ensure `initialize()` was called during deployment and succeeded on-chain.
2. Verify `TREASURY_STRATEGIES_ADDRESS` in your `.env` points to the deployed and initialized contract.

---

## Signaling Errors

#### `Already initialized` (`SignalAnchorError::AlreadyInitialized`)

**Cause:** `initialize()` was called on a signal anchor contract that has already been initialized. The `Admin` key is already set in instance storage.

**Fix:**
1. Verify `SIGNAL_ANCHOR_ADDRESS` in your `.env` points to a newly deployed contract.
2. Use a new contract address for each deployment.
3. Call `admin()` to confirm the contract is already initialized and identify the current admin.

---

#### `Already anchored` (`SignalAnchorError::AlreadyAnchored`)

**Cause:** `anchor_result()` was called for a `poll_id` that already has an anchor record in persistent storage. Each poll result is immutable once anchored — a second call for the same `poll_id` is rejected.

**Fix:**
1. Call `get_anchor(poll_id)` to check whether a result has already been anchored before calling `anchor_result()`.
2. If the anchored result is incorrect, it cannot be overwritten on-chain; the off-chain signaling service should treat this as a critical error and investigate the root cause before anchoring any further polls.
3. To re-anchor (e.g., after a data error during development), deploy a fresh contract instance and re-anchor from the beginning.

---

#### `Unauthorized` (`SignalAnchorError::Unauthorized`)

**Cause:** `anchor_result()` was called with an `anchorer` address that does not match the admin configured during `initialize()`. Only the backend's designated signaling service account may anchor poll results.

**Fix:**
1. Ensure the backend signaling service signs `anchor_result()` with the admin key configured during deployment.
2. Verify `SIGNAL_ANCHOR_ADMIN_SECRET` in your backend `.env` matches the admin address stored in the contract (query with `admin()`).

---

#### `Not initialized` (`SignalAnchorError::NotInitialized`)

**Cause:** `anchor_result()` or `admin()` was called before `initialize()` has been invoked. The `Admin` key is absent from instance storage.

**Fix:**
1. Ensure `initialize()` was called during deployment and succeeded on-chain.
2. Verify `SIGNAL_ANCHOR_ADDRESS` in your `.env` or backend config points to the deployed and initialized contract.
3. Run `scripts/verify-deployment.sh` to confirm signal-anchor initialization status.

---

## FAQ

**Q: How do I find the correct contract addresses for my network?**

A: Contract addresses are published in [scripts/](../scripts/) after each deployment. You can also query the factory: `liquidity.governor()` returns the governor address linked to the liquidity contract.

**Q: My transaction simulates successfully but fails on-chain. Why?**

A: State can change between simulation and submission (another transaction was included first). Retry the simulation immediately before resubmitting, or add a short polling loop.

**Q: How do I run contract calls without the frontend?**

A: Use the Stellar CLI:
```bash
stellar contract invoke \
  --network testnet \
  --id <CONTRACT_ADDRESS> \
  --source <SECRET_KEY> \
  -- <function_name> --arg1 value1
```

**Q: Can I test on Futurenet before Testnet?**

A: Yes. Set `NEXT_PUBLIC_RPC_URL` to `https://rpc-futurenet.stellar.org` and `NEXT_PUBLIC_NETWORK_PASSPHRASE` to the Futurenet passphrase. Deploy contracts to Futurenet first using `stellar contract deploy --network futurenet`.

**Q: How do I reset local state during development?**

A: Re-initialize the contracts with fresh deployments:
```bash
stellar contract deploy --wasm target/wasm32v1-none/release/sorogov_governor.wasm --network testnet --source <KEY>
```
Update the address in `.env.local` and restart the dev server.

**Q: Why does `get_lp_position` return 0 even after adding liquidity?**

A: The provider address queried must exactly match the one used in `add_liquidity`. Also verify that `outcome_a` and `outcome_b` are in the correct order (use canonical order: smaller id first, e.g., `(0, 1)` not `(1, 0)`).

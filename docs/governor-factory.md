# Governor Factory

## Overview

The **Governor Factory** contract (`contracts/governor-factory`) is a permissionless deployer. A single `deploy` call creates a complete governance stack for a token:

1. a **Token-Votes** contract wrapping the governance token (checkpointed voting power),
2. a **Timelock** contract that executes queued proposals after a delay,
3. a **Governor** contract that runs the proposal lifecycle and votes.

The factory initializes all three contracts, wires them to each other, and records the resulting addresses in an on-chain registry so indexers and frontends can discover every governor it has produced.

## How It Works

### Deployment Flow

```text
Deployer calls deploy(...)
          ↓
Validate settings (voting period, quorum, timelock delay, vote type)
          ↓
Optional: check deployer's native-asset balance (if NativeToken is set)
          ↓
Deploy Token-Votes, Timelock, Governor (salts derived from the governor ID)
          ↓
Initialize Token-Votes(deployer, token)
          ↓
Initialize Timelock(deployer, governor, timelock_delay, 1_209_600)
          ↓
Initialize Governor(deployer, token_votes, timelock, ...settings)
          ↓
Store GovernorEntry under its ID, append ID to the registry list
          ↓
Emit GovernorDeployed and return the governor ID
```

Each step runs inside the same invocation. If any step fails, the whole call reverts and no registry entry is written.

### Key Concepts

- **Governor ID**: A `u64` starting at `1`. IDs are assigned sequentially by `governor_count() + 1`.
- **Deterministic addresses**: Each contract's salt is derived from the governor ID and a per-contract suffix (`1` for Token-Votes, `2` for Timelock, `3` for Governor). For a given factory and ID, the three addresses are predictable before the deploy call.
- **Deployer as admin**: The `deployer` address becomes the admin of the Token-Votes, Timelock and Governor instances it creates.
- **Execution window**: The Timelock is always initialized with an execution window of `1_209_600` (14 days). It is not a `deploy` parameter.
- **Native-asset preflight**: When the factory admin has configured a native token with `set_native_token`, `deploy` requires the deployer to hold at least `estimate_deploy_cost()` stroops of that token. The estimate is `3 × 5_000_000` stroops.
- **Quorum of zero**: A `quorum_numerator` of `0` is valid. The governor treats it as "any positive vote count satisfies quorum", which suits signaling and prediction-market use cases.

## Public Entrypoints

| Function | Signature | Description | Authorization |
| --- | --- | --- | --- |
| `initialize` | `(admin: Address, governor_wasm: BytesN<32>, timelock_wasm: BytesN<32>, token_votes_wasm: BytesN<32>)` | Stores the admin and the WASM hashes used for every future deployment. Sets the governor count to `0`. Can only be called once. | `admin` |
| `set_native_token` | `(admin: Address, native_token: Address)` | Sets the native-asset token contract used for the deployer balance preflight. | `admin` (must match the stored admin) |
| `native_token` | `() -> Option<Address>` | Returns the configured native-asset token contract, if any. | None (read-only) |
| `estimate_deploy_cost` | `() -> i128` | Returns the minimum native-asset reserve, in stroops, required to deploy the three-contract stack. | None (read-only) |
| `deploy` | `(deployer: Address, token: Address, voting_delay: u32, voting_period: u32, quorum_numerator: u32, proposal_threshold: i128, timelock_delay: u64, guardian: Address, vote_type: u32, proposal_grace_period: u32) -> u64` | Deploys and initializes a governor stack for `token`, registers it, and returns its governor ID. | `deployer` |
| `get_governor` | `(id: u64) -> GovernorEntry` | Returns the registry entry for a governor ID. | None (read-only) |
| `get_all_governors` | `(offset: u32, limit: u32) -> Vec<GovernorEntry>` | Returns a paginated slice of the registry, in deployment order. Out-of-range offsets return an empty list. | None (read-only) |
| `governor_count` | `() -> u64` | Returns the total number of governors deployed so far. | None (read-only) |

### `deploy` Parameters

| Parameter | Type | Rule |
| --- | --- | --- |
| `token` | `Address` | The governance token. Wrapped by the new Token-Votes contract. |
| `voting_delay` | `u32` | Passed through to the Governor. |
| `voting_period` | `u32` | Must be greater than `0`. |
| `quorum_numerator` | `u32` | Must be `100` or less. `0` is allowed. |
| `proposal_threshold` | `i128` | Passed through to the Governor. |
| `timelock_delay` | `u64` | Must be greater than `0`. |
| `guardian` | `Address` | Guardian address passed to the Governor. |
| `vote_type` | `u32` | `0` = Simple, `1` = Extended, `2` = Quadratic. Values above `2` are rejected. |
| `proposal_grace_period` | `u32` | Passed through to the Governor. |

Validation runs before any contract is deployed, so a misconfigured call fails without creating partial state.

### Registry

Each successful `deploy` writes a `GovernorEntry` keyed by its ID:

```rust
pub struct GovernorEntry {
    pub id: u64,
    pub governor: Address,   // Governor contract
    pub timelock: Address,   // Timelock contract
    pub token: Address,      // Token-Votes contract (not the underlying governance token)
    pub deployer: Address,   // Address that called deploy
}
```

The `token` field holds the **Token-Votes** address the factory created. To find the underlying governance token, read the Token-Votes contract. The registry also keeps an ordered list of IDs, which `get_all_governors` pages through.

## Events

| Topic | Data Payload | Emitted When |
| --- | --- | --- |
| `("GovernorDeployed", deployer: Address)` | `GovernorDeployedEvent { id, governor, timelock, token_votes, deployer, timestamp }` | A governor stack is deployed and registered by `deploy`. |

`timestamp` is the ledger timestamp at deployment. `token_votes` is the same address stored as `token` in the registry entry.

## Errors

`FactoryError` is a `#[contracterror]` with explicit status codes:

| Code | Name | Description |
| --- | --- | --- |
| 1 | `InvalidVotingPeriod` | `voting_period` is `0`. |
| 2 | `InvalidQuorumNumerator` | `quorum_numerator` is greater than `100`. |
| 3 | `InvalidTimelockDelay` | `timelock_delay` is `0`. |
| 4 | `InvalidVoteType` | `vote_type` is greater than `2`. |
| 5 | `InsufficientBalance` | The deployer's native-asset balance is below `estimate_deploy_cost()`. |
| 6 | `WasmNotFound` | A contract WASM hash is missing from factory storage. |
| 7 | `NotInitialized` | `set_native_token` was called before `initialize`. |
| 8 | `GovernorNotFound` | `get_governor` was called with an ID that is not registered. |

Some failures use plain panics rather than error codes:

- `initialize` panics with `already initialized` if the factory is already set up.
- `set_native_token` panics with `not admin` if the caller is not the stored admin.

## Deployment Order

The factory needs the compiled WASM of the three contracts it deploys, so their hashes must exist before the factory is initialized.

1. **Upload WASM**: Install `sorogov_governor`, `sorogov_timelock` and `sorogov_token_votes` on the network and note their hashes.
2. **Deploy the factory**: Deploy `contracts/governor-factory`.
3. **Initialize the factory**: Call `initialize` with the admin address and the three WASM hashes. Use the governor, timelock and token-votes hashes in that order.
   ```text
   initialize(admin, governor_wasm_hash, timelock_wasm_hash, token_votes_wasm_hash)
   ```
4. **Optional: enable the balance preflight**: Call `set_native_token(admin, native_token_address)` on the network's native asset contract.
5. **Deploy governors**: Any account can call `deploy(...)`. Read the new governor's addresses from the returned ID with `get_governor(id)`, or from the `GovernorDeployed` event.

The factory does not need the governance token to exist before it is initialized. The token address is supplied per `deploy` call.

## Related Documentation

- [Architecture Overview](./architecture.md)
- [Timelock](./timelock.md)
- [Co-Sponsorship](./co-sponsorship.md)
- [Deployment](./deployment.md)
- [Troubleshooting](./troubleshooting.md)

# Governor Factory

## Overview

The **Governor Factory** (`contracts/governor-factory`) is the permissionless deployment engine of the NebGov ecosystem. It enables anyone to deploy a fully configured, production-ready, three-contract governance stack on Stellar in a single atomic transaction.

Instead of requiring builders to manually compile, upload, deploy, and interconnect individual governance contracts, the factory:

- **Deploys the full stack atomically**: Spins up the Token-Votes, Timelock, and Governor contracts in a single Soroban call.
- **Enforces proper initialization**: Wires contract addresses to each other correctly, eliminating human configuration error during setup.
- **Predicts contract addresses**: Employs deterministic salt generation derived from deployment IDs so contract addresses can be computed ahead of time.
- **Maintains an on-chain registry**: Stores an indexed registry of all deployed governor instances with support for paginated queries.
- **Emits rich indexing events**: Publishes unified deployment events for off-chain indexers and user interfaces.
- **Validates settings preflight**: Prevents wasted contract deployments by verifying parameter boundaries and optional deployer native asset reserves before deploying.

---

## Architecture & How It Works

### The Three-Contract Governance Stack

Every deployment initiated via the factory creates and configures three distinct contracts:

```
┌────────────────────────────────────────────────────────┐
│                   Governor Factory                     │
│                        deploy()                        │
└───────┬───────────────────┬───────────────────┬────────┘
        │ 1. Deploy & Init  │ 2. Deploy & Init  │ 3. Deploy & Init
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Token-Votes  │   │   Timelock    │   │   Governor    │
│  (Voting w/   │◄──┤   (Delayed    │◄──┤  (Proposals,  │
│  Delegation)  │   │  Execution)   │   │ Voting Logic) │
└───────┬───────┘   └───────────────┘   └───────────────┘
        │ Underlying SEP-41
        ▼
┌───────────────┐
│ SEP-41 Token  │
└───────────────┘
```

1. **Token-Votes Contract** (`contracts/token-votes`):
   Wraps an existing SEP-41 token with checkpointed voting power, delegation (including split delegation), and past-vote querying.
2. **Timelock Contract** (`contracts/timelock`):
   Acts as the execution controller and asset owner. Proposals passing the governor must wait for the timelock delay before executing, protecting protocol funds from sudden malicious proposals.
3. **Governor Contract** (`contracts/governor`):
   The central governance brain. Manages proposal submissions, voting delays, vote recording (Simple, Extended, or Quadratic), quorum checks, and queueing to the Timelock.

---

### Deployment Sequence & Interdependencies

Because the contracts depend on each other's addresses (e.g., Timelock needs Governor's address, Governor needs both Token-Votes and Timelock addresses), the factory coordinates deployment and initialization in a strict 3-phase sequence:

```
Phase 1: Deterministic Deployment
  ├─ Derive salt from deployment ID + contract suffix
  ├─ Deploy Token-Votes (suffix 1) -> token_votes_addr
  ├─ Deploy Timelock    (suffix 2) -> timelock_addr
  └─ Deploy Governor    (suffix 3) -> governor_addr

Phase 2: Interconnected Initialization
  ├─ 1. Initialize Token-Votes:
  │     TokenVotesClient::initialize(admin=deployer, token=underlying_token)
  ├─ 2. Initialize Timelock:
  │     TimelockClient::initialize(admin=deployer, governor=governor_addr, min_delay=timelock_delay, execution_window=14 days)
  └─ 3. Initialize Governor:
        GovernorClient::initialize(
          admin=deployer,
          votes_token=token_votes_addr,
          timelock=timelock_addr,
          voting_delay, voting_period, quorum_numerator,
          proposal_threshold, guardian, vote_type, proposal_grace_period
        )

Phase 3: Registry & Notification
  ├─ Store GovernorEntry in persistent storage under DataKey::Governor(id)
  ├─ Increment DataKey::GovernorCount
  ├─ Append id to DataKey::GovernorList
  └─ Emit GovernorDeployed event
```

---

### Salt Derivation & Deterministic Addresses

The factory generates unique 32-byte salts based on the sequential deployment `id` (big-endian bytes `[0..8]`) and a type suffix at byte `31`:

| Contract | Salt Suffix (Byte 31) | Description |
|---|---|---|
| **Token-Votes** | `1` | Voting power and delegation contract |
| **Timelock** | `2` | Execution timelock controller |
| **Governor** | `3` | Core proposal lifecycle governor |

Because addresses on Stellar are derived deterministically from the deployer contract address and salt hash (`env.deployer().with_current_contract(salt).deployed_address()`), integrators and off-chain tools can compute the exact addresses of all three contracts prior to or during deployment.

---

## Public Entrypoints

### Factory Administration & Configuration

#### `initialize`
```rust
pub fn initialize(
    env: Env,
    admin: Address,
    governor_wasm: BytesN<32>,
    timelock_wasm: BytesN<32>,
    token_votes_wasm: BytesN<32>,
)
```
Initializes the factory instance with the contract administrator and the pre-uploaded WASM byte hashes of the three child contracts.
- **Auth**: Requires `admin` signature.
- **Panics**: Panics with `"already initialized"` if invoked more than once.

#### `set_native_token`
```rust
pub fn set_native_token(env: Env, admin: Address, native_token: Address)
```
Configures the network's native asset contract address (e.g., Stellar Asset Contract for native XLM). When configured, `deploy` checks that the deployer has sufficient balance to satisfy minimum contract storage reserves.
- **Auth**: Requires `admin` signature.
- **Panics**: Panics with `"not admin"` if caller is not the registered factory admin, or `"factory not initialized"` if factory has not been initialized.

#### `native_token`
```rust
pub fn native_token(env: Env) -> Option<Address>
```
Returns the configured native asset token contract address, or `None` if not set.

#### `estimate_deploy_cost`
```rust
pub fn estimate_deploy_cost(_env: Env) -> i128
```
Returns the minimum recommended XLM reserve in stroops required to deploy the three-contract stack:
$$\text{Cost} = 3 \times 5{,}000{,}000\text{ stroops} = 15{,}000{,}000\text{ stroops (1.5 XLM)}$$

---

### Deployment Entrypoint

#### `deploy`
```rust
pub fn deploy(
    env: Env,
    deployer: Address,
    token: Address,
    voting_delay: u32,
    voting_period: u32,
    quorum_numerator: u32,
    proposal_threshold: i128,
    timelock_delay: u64,
    guardian: Address,
    vote_type: u32,
    proposal_grace_period: u32,
) -> u64
```
Deploys and initializes a complete governance instance, records it in the factory registry, and emits `GovernorDeployed`.
- **Auth**: Requires `deployer` signature.
- **Returns**: The assigned sequential deployment `id` (`u64`, starting from `1`).
- **Errors**: Panics with `FactoryError` if any preflight parameter validation fails (see [Errors & Validations](#errors--preflight-validations)).

---

### Registry & Query Entrypoints

#### `get_governor`
```rust
pub fn get_governor(env: Env, id: u64) -> GovernorEntry
```
Fetches the registry entry for a specific governor by deployment ID.
- **Panics**: Panics with `"governor not found"` if the specified `id` does not exist.

#### `get_all_governors`
```rust
pub fn get_all_governors(env: Env, offset: u32, limit: u32) -> Vec<GovernorEntry>
```
Returns a paginated list of registered governor entries.
- `offset`: Starting index in the deployment list.
- `limit`: Maximum number of entries to return.

#### `governor_count`
```rust
pub fn governor_count(env: Env) -> u64
```
Returns the total count of governors deployed by this factory.

---

## Deployment & Initialization Parameters

When calling `deploy()`, the caller supplies governance parameters that configure each component in the stack:

| Parameter | Type | Valid Range | Target Contract | Description |
|---|---|---|---|---|
| `deployer` | `Address` | Valid account / contract | All | Account initiating deployment and initial admin of child contracts |
| `token` | `Address` | Existing SEP-41 token | `TokenVotes` | Underlying token address for voting power calculations |
| `voting_delay` | `u32` | $\ge 0$ (ledgers) | `Governor` | Delay between proposal creation and voting start (~5s per ledger) |
| `voting_period` | `u32` | $> 0$ (ledgers) | `Governor` | Duration voting remains open. Cannot be 0 |
| `quorum_numerator` | `u32` | $0 \le x \le 100$ (%) | `Governor` | Quorum percentage required for proposal validity ($0$ is valid for signaling) |
| `proposal_threshold`| `i128` | $\ge 0$ | `Governor` | Minimum voting weight required to submit a proposal |
| `timelock_delay` | `u64` | $> 0$ (seconds) | `Timelock` | Minimum waiting time between queueing and executing a proposal |
| `guardian` | `Address` | Valid address | `Governor` | Account empowered to cancel proposals in emergencies |
| `vote_type` | `u32` | `0`, `1`, `2` | `Governor` | Voting system: `0` = Simple, `1` = Extended, `2` = Quadratic |
| `proposal_grace_period`| `u32`| $\ge 0$ (ledgers) | `Governor` | Window after voting ends during which a successful proposal must be queued |

### Voting Types
- **0: Simple** — Basic For / Against voting.
- **1: Extended** — Supports For, Against, and Abstain vote choices.
- **2: Quadratic** — Quadratic voting model where voting weight is proportional to $\sqrt{\text{tokens}}$.

---

## Address Registry

Every successful deployment is stored in persistent storage:

```rust
#[contracttype]
#[derive(Clone)]
pub struct GovernorEntry {
    pub id: u64,
    pub governor: Address,
    pub timelock: Address,
    pub token: Address,
    pub deployer: Address,
}
```

### Storage Layout (`DataKey`)

| Key | Storage Type | Value Type | Description |
|---|---|---|---|
| `DataKey::Admin` | Instance | `Address` | Factory administrator address |
| `DataKey::GovernorWasm` | Instance | `BytesN<32>` | WASM hash of `sorogov_governor` |
| `DataKey::TimelockWasm` | Instance | `BytesN<32>` | WASM hash of `sorogov_timelock` |
| `DataKey::TokenVotesWasm` | Instance | `BytesN<32>` | WASM hash of `sorogov_token_votes` |
| `DataKey::GovernorCount` | Instance | `u64` | Total number of deployed governors |
| `DataKey::GovernorList` | Instance | `Vec<u64>` | Ordered vector of all deployment IDs |
| `DataKey::NativeToken` | Instance | `Address` | Configured native XLM token address |
| `DataKey::Governor(u64)` | Persistent | `GovernorEntry` | Deployment record indexed by ID |

---

## Event Emissions

When a new governor stack is deployed, the factory emits a `GovernorDeployed` event via `env.events().publish()`:

### Topic Structure
- **Topic 0**: `Symbol("GovernorDeployed")`
- **Topic 1**: `deployer: Address`

### Event Payload (`GovernorDeployedEvent`)
```rust
#[contracttype]
pub struct GovernorDeployedEvent {
    pub id: u64,
    pub governor: Address,
    pub timelock: Address,
    pub token_votes: Address,
    pub deployer: Address,
    pub timestamp: u64,
}
```

Off-chain indexers (`packages/indexer`) subscribe to topic `"GovernorDeployed"` to immediately discover and begin tracking newly deployed DAOs without polling factory storage.

---

## Errors & Preflight Validations

The factory performs preflight validation before deploying any child contracts. If any validation fails, the entire transaction reverts and no contracts are created:

```rust
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FactoryError {
    InvalidVotingPeriod = 1,
    InvalidQuorumNumerator = 2,
    InvalidTimelockDelay = 3,
    InvalidVoteType = 4,
    InsufficientBalance = 5,
    WasmNotFound = 6,
}
```

### Validation Rules

| Error | Code | Trigger Condition | Rationale |
|---|---|---|---|
| `InvalidVotingPeriod` | `1` | `voting_period == 0` | Proposals must have a non-zero window for voting |
| `InvalidQuorumNumerator` | `2` | `quorum_numerator > 100` | Quorum percentage cannot exceed 100%. Note: `0` is explicitly permitted for signaling protocols |
| `InvalidTimelockDelay` | `3` | `timelock_delay == 0` | Timelock delay must be strictly positive to ensure execution safety |
| `InvalidVoteType` | `4` | `vote_type > 2` | Only Simple (`0`), Extended (`1`), and Quadratic (`2`) are valid |
| `InsufficientBalance` | `5` | `balance < estimate_deploy_cost()` | When `native_token` is configured, deployer must hold at least 15 XLM in reserves |
| `WasmNotFound` | `6` | Missing WASM hash in storage | Factory contract has not had required WASM hashes initialized |

---

## Usage Examples

### Deploying via Stellar CLI

```bash
# 1. Inspect deploy cost
stellar contract invoke \
  --id <FACTORY_CONTRACT_ID> \
  --source <DEPLOYER_IDENTITY> \
  --network testnet \
  -- estimate_deploy_cost

# 2. Deploy a new governance stack
stellar contract invoke \
  --id <FACTORY_CONTRACT_ID> \
  --source <DEPLOYER_IDENTITY> \
  --network testnet \
  -- deploy \
  --deployer <DEPLOYER_ADDRESS> \
  --token <SEP41_TOKEN_ADDRESS> \
  --voting_delay 100 \
  --voting_period 17280 \
  --quorum_numerator 4 \
  --proposal_threshold 1000000000 \
  --timelock_delay 86400 \
  --guardian <GUARDIAN_ADDRESS> \
  --vote_type 1 \
  --proposal_grace_period 120960
```

### Querying via TypeScript SDK

```typescript
import { Contract, rpc } from '@stellar/stellar-sdk';

const factory = new Contract(FACTORY_CONTRACT_ID);

// Fetch total number of governors
const countResult = await server.invokeContract({
  contractId: FACTORY_CONTRACT_ID,
  functionName: 'governor_count',
  args: [],
});

// Fetch latest deployed governor
const latestEntry = await server.invokeContract({
  contractId: FACTORY_CONTRACT_ID,
  functionName: 'get_governor',
  args: [countResult],
});

console.log('Governor:', latestEntry.governor);
console.log('Timelock:', latestEntry.timelock);
console.log('TokenVotes:', latestEntry.token);
```

---

## Related Contracts & Documentation

- **[Governor Contract](./architecture.md#governor-contract)** — Core governance logic and proposal lifecycle
- **[Timelock Controller](./architecture.md#stellar-smart-contracts)** — Execution timelock and proposal enforcement
- **[Vote Escrow](./vote-escrow.md)** — Boosted voting power via time-locked token locks
- **[Deployment Guide](./deployment.md)** — Production deployment manual for NebGov smart contracts

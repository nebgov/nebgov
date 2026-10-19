# Timelock

## Overview

The **Timelock** (`contracts/timelock`) sits between the Governor and every contract the DAO controls. A passed proposal is not executed immediately: the Governor schedules its actions on the Timelock, they wait out a **minimum delay**, and only then can they be executed inside an **execution window**. The delay gives token holders time to react to a decision (exit, delegate, or have the guardian cancel it) before it takes effect.

```
propose() → Governor → [voting period] → queue() → Timelock.schedule*()
                                                      │
                                       [min delay: operation is pending]
                                                      │
                                       [execution window: operation is ready]
                                                      │
                                         execute() / execute_batch()
                                                      │
                                              target contract call
```

Every state-changing path except `cancel` and the admin parameter updates is restricted to the configured **governor** address. `cancel` can also be called by the **admin**.

## Roles

| Role     | Set by                | Can do                                                                                           |
| -------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| Governor | `initialize`          | Schedule, execute, cancel, recover batches, call `update_min_delay`.                             |
| Admin    | `initialize`          | Cancel, `update_delay`, `update_execution_window`.                                               |
| Anyone   | n/a                   | Read state, compute IDs, validate a dependency DAG.                                              |

## Operation lifecycle

An operation is identified by an `op_id` (a SHA-256 hash, see [Operation IDs](#operation-ids)) and stores:

| Field          | Meaning                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `target`       | Contract to call.                                                          |
| `fn_name`      | Function to call on `target`.                                              |
| `data`         | XDR-encoded argument vector (empty means no arguments).                    |
| `ready_at`     | Ledger timestamp from which the operation can run (`now + delay`).         |
| `expires_at`   | `ready_at + execution_window`; after this the operation can never run.     |
| `executed`     | Set when executed.                                                         |
| `cancelled`    | Set when cancelled.                                                        |
| `predecessor`  | Optional `op_id` (single or batch) that must be executed first.            |

```
              schedule              ready_at                 expires_at
 (none) ───────────────► Pending ──────────────► Ready ─────────────────► Expired
                            │                      │
                            │ cancel               │ execute
                            ▼                      ▼
                        Cancelled               Executed
```

- **Pending** – scheduled, `now < ready_at`. `is_pending` is true.
- **Ready** – `ready_at <= now <= expires_at` and neither executed nor cancelled. `is_ready` is true.
- **Expired** – `now > expires_at`. Executing fails with `OperationExpired`. There is no explicit "expired" flag; it is derived from the timestamp.
- **Executed / Cancelled** – terminal. Both flags make later `execute` or `cancel` calls fail.

### Queueing

`schedule` stores one operation, `schedule_batch` stores several under a single `batch_op_id`, and `schedule_with_deps` stores one operation with several predecessors. All three:

- require the caller to be the governor (and to authorize the call);
- require `delay >= min_delay` (otherwise panic `delay too short`);
- compute `ready_at = ledger timestamp + delay` and `expires_at = ready_at + execution_window`;
- extend the entry's storage TTL to cover the full delay plus window, with a safety buffer;
- emit events (see [Events](#events)).

Scheduling the same operation twice is rejected (`operation already scheduled`), and a missing predecessor is rejected with `PredecessorNotFound`.

### Execution

`execute` (single) and `execute_batch` (batch) require the governor and check, in order:

1. The operation exists, is not executed and is not cancelled.
2. `now >= ready_at` (the minimum delay has elapsed).
3. `now <= expires_at` (the execution window is still open).
4. Every predecessor has completed.

The call is then forwarded to `target.fn_name(args)` and the operation is marked `executed`. `execute_batch` is **all-or-nothing**: sub-calls run in order and if any one panics, the whole transaction reverts and nothing takes effect.

### Cancellation

`cancel(caller, op_id)` accepts either an `op_id` or a `batch_op_id` and may be called by the **governor or the admin**. It panics with `invalid state` if the operation was already executed or cancelled, and with `operation not found` if the ID is unknown. Cancelling does not delete the entry; it sets `cancelled`, which blocks any later execution.

## Minimum delay and execution window

| Parameter          | Default (if unset) | Getter             | Updated by                                  |
| ------------------ | ------------------ | ------------------ | ------------------------------------------- |
| Minimum delay      | 86,400 s (1 day)   | `min_delay`        | `update_min_delay` (governor), `update_delay` (admin) |
| Execution window   | 1,209,600 s (14 d) | `execution_window` | `update_execution_window` (admin)           |

Both values are in seconds and are fixed into an operation at scheduling time: changing them later does not move `ready_at` or `expires_at` of operations that already exist.

`update_min_delay` is the governance-gated path: it must be called by the governor, `new_delay` must be greater than zero, and `new_delay + execution_window` must not overflow. The admin-gated `update_delay` and `update_execution_window` exist for operational adjustment and emit the short-topic events `upd_dly` and `upd_win` carrying `(old, new)`.

> **Security note:** the admin can shorten the minimum delay without a vote. Production deployments should transfer admin duties to a multisig, or to the governance process itself, and treat the admin as a trusted role.

## DAG-batched operations

Operations can depend on each other, forming a directed acyclic graph (DAG).

### Predecessors

- `schedule` and `schedule_batch` take a single `predecessor` (`Bytes`, empty for none). The predecessor may be an `op_id` or a `batch_op_id`, and must already exist when scheduling. `execute` and `execute_batch` fail with `PredecessorNotDone` until it has been executed.
- `schedule_with_deps` takes a `predecessors: Vec<Bytes>` list, validated on scheduling, and persisted. `all_predecessors_done` reports whether all of them are executed, and `execute` fails with `PredecessorNotComplete` otherwise.

### Batches

`schedule_batch` takes parallel `targets`, `datas` and `fn_names` vectors (they must be non-empty and equal length, otherwise `empty batch` / `length mismatch`) plus one `predecessor` and one `salt` for the whole batch. It returns one `batch_op_id`. The batch records a dependency graph (the batch node, plus the predecessor node and an edge `predecessor → batch` when present), readable with `get_batch_dependency_graph`.

### Validating a graph

`validate_dependency_dag(op_ids)` is a read-only check (Kahn's algorithm) that returns a `DagValidationResult { valid, cycle_path }`:

- `valid = true`, empty `cycle_path`: the operations can be topologically ordered.
- `valid = false`: `cycle_path` lists the operations that could not be ordered (members of, or blocked by, a cycle).
- Panics with `IncompletePredecessorClosure` if `op_ids` omits any transitive predecessor of the supplied operations. Include the full closure, otherwise cycles through the missing node could go undetected.

It emits `DependencyDagValidated` or `CycleDetected` accordingly.

### Partial execution and recovery

`execute_batch_partial` is the fault-tolerant alternative to `execute_batch`. Each sub-call is attempted independently; failures are recorded instead of reverting the batch.

1. Sub-calls run in order. Successes go to `completed_ops`, failures to `failed_ops` (with target, function, data, `failed_at_ledger` and `retry_count`).
2. If nothing failed the batch is marked `executed`. If anything failed the batch enters **recovery mode** with `recovery_deadline = current ledger sequence + 100,000`, and the returned `PartialBatchExecutionState` shows what is pending.
3. While recovery mode is on and before the deadline, the governor can call:
   - `retry_failed_operation(batch_op_id, op_id)`: re-invokes the original call. If it fails again the whole transaction reverts. On success the operation moves to `completed_ops`.
   - `skip_failed_operation(batch_op_id, op_id)`: permanently drops the failed operation from the recovery list.
4. When `failed_ops` becomes empty, recovery mode ends and `BatchFullyComplete` is emitted.

`retry_failed_operation` fails with `BatchInRecoveryMode` if the batch is **not** in recovery mode, and with `BatchRecoveryExpired` once the ledger sequence reaches `recovery_deadline`. Read the state at any time with `get_partial_batch_state`. Since the batch is only marked `executed` when nothing failed, treat `completed_ops` as the source of truth for partially applied batches.

## Operation IDs

IDs are deterministic SHA-256 hashes, so scheduling is idempotent and IDs can be computed off-chain or with the on-chain helpers:

| Function                                                              | Hash input                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `compute_op_id(target, data, predecessor, salt)`                      | XDR(target) ‖ data ‖ predecessor ‖ salt                             |
| `compute_batch_op_id(targets, datas, fn_names, predecessor, salt)`    | per item: XDR(target) ‖ data ‖ XDR(fn_name); then predecessor ‖ salt |
| `schedule_with_deps` (internal)                                       | XDR(target) ‖ data ‖ XDR(fn_name) ‖ each predecessor ‖ salt          |

Use a distinct `salt` to schedule an otherwise identical operation more than once.

## Public entrypoints

All write entrypoints call `caller.require_auth()`.

### Setup

| Function                                                             | Access     | Description                                                               |
| -------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `initialize(admin, governor, min_delay, execution_window)`           | admin auth | One-time setup. Panics `already initialized` if called again.             |

### Scheduling

| Function                                                                                   | Access   | Returns | Description                                                  |
| ------------------------------------------------------------------------------------------ | -------- | ------- | ------------------------------------------------------------ |
| `schedule(caller, target, data, fn_name, delay, predecessor, salt)`                        | governor | `op_id` | Schedule one operation.                                      |
| `schedule_batch(caller, targets, datas, fn_names, delay, predecessor, salt)`               | governor | `batch_op_id` | Schedule an atomic batch.                              |
| `schedule_with_deps(caller, target, data, fn_name, delay, predecessors, salt)`             | governor | `op_id` | Schedule one operation with a list of predecessors.          |

### Execution and cancellation

| Function                                              | Access           | Description                                                                 |
| ----------------------------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| `execute(caller, op_id)`                              | governor         | Execute a ready operation.                                                  |
| `execute_batch(caller, batch_op_id)`                  | governor         | Execute a ready batch atomically.                                           |
| `execute_batch_partial(caller, batch_op_id)`          | governor         | Execute a batch tolerating failures; returns `PartialBatchExecutionState`.  |
| `retry_failed_operation(caller, batch_op_id, op_id)`  | governor         | Retry a failed sub-operation during recovery.                               |
| `skip_failed_operation(caller, batch_op_id, op_id)`   | governor         | Permanently skip a failed sub-operation.                                    |
| `cancel(caller, op_id)`                               | governor / admin | Cancel a pending operation or batch.                                        |

### Parameters

| Function                                      | Access   | Description                                                         |
| --------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `update_min_delay(caller, new_delay)`         | governor | Set the minimum delay (`> 0`, no overflow with the window).         |
| `update_delay(caller, new_delay)`             | admin    | Set the minimum delay. Panics `only admin` otherwise.               |
| `update_execution_window(caller, new_window)` | admin    | Set the execution window. Panics `only admin` otherwise.            |

### Queries (no auth)

| Function                                  | Returns                                      | Description                                                   |
| ----------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `compute_op_id(...)`                      | `Bytes`                                      | See [Operation IDs](#operation-ids).                          |
| `compute_batch_op_id(...)`                | `Bytes`                                      | See [Operation IDs](#operation-ids).                          |
| `get_operation(op_id)`                    | `Option<Operation>`                          | Stored operation, or none.                                    |
| `get_batch_operation(batch_op_id)`        | `Option<BatchOperation>`                     | Stored batch, or none.                                        |
| `is_pending(op_id)`                       | `bool`                                       | Scheduled, not executed or cancelled, and before `ready_at`.  |
| `is_ready(op_id)`                         | `bool`                                       | Inside the execution window and not executed or cancelled.    |
| `is_done(op_id)`                          | `bool`                                       | Executed.                                                     |
| `is_batch_done(batch_op_id)`              | `bool`                                       | Batch executed.                                               |
| `all_predecessors_done(op_id)`            | `bool`                                       | True when there are no stored predecessors, or all are done.  |
| `get_batch_dependency_graph(batch_op_id)` | `Option<DependencyGraph>`                    | Nodes and edges recorded for the batch.                       |
| `validate_dependency_dag(op_ids)`         | `DagValidationResult`                        | Cycle check, see [above](#validating-a-graph).                |
| `get_partial_batch_state(batch_op_id)`    | `Option<PartialBatchExecutionState>`         | Recovery state of a partially executed batch.                 |
| `min_delay()` / `execution_window()`      | `u64`                                        | Current configuration, in seconds.                            |
| `governor()` / `admin()`                  | `Address`                                    | Configured roles.                                             |

`is_pending` and `is_ready` apply to single operations; use `get_batch_operation` and compare against the ledger timestamp for batches.

## Events

Typed events use a single `Symbol` topic and a struct payload.

| Topic                    | Payload                                                      | Emitted by                                   |
| ------------------------ | ------------------------------------------------------------ | -------------------------------------------- |
| `OperationScheduled`     | `{ op_id, target, fn_name, ready_at, expires_at }`           | `schedule`, `schedule_with_deps`             |
| `OperationExecuted`      | `{ op_id, caller }`                                          | `execute`                                    |
| `OperationCancelled`     | `{ op_id, caller }`                                          | `cancel` (single operation)                  |
| `BatchOperationScheduled`| `{ batch_op_id, targets, fn_names, ready_at, expires_at }`   | `schedule_batch`                             |
| `BatchOperationExecuted` | `{ batch_op_id, caller }`                                    | `execute_batch`                              |
| `BatchOperationCancelled`| `{ batch_op_id, caller }`                                    | `cancel` (batch)                             |
| `MinDelayUpdated`        | `{ old_delay, new_delay }`                                   | `update_min_delay`                           |
| `DependencyDagValidated` | `(batch_op_id, op_count)`                                    | `validate_dependency_dag` (valid graph)      |
| `CycleDetected`          | cycle path (`Vec<Bytes>`)                                    | `validate_dependency_dag` (cycle found)      |
| `PartialBatchStarted`    | batch id, total operations                                   | `execute_batch_partial`                      |
| `PartialOpSucceeded`     | batch id, op id, progress counters                           | `execute_batch_partial`                      |
| `PartialOpFailed`        | batch id, op id                                              | `execute_batch_partial`                      |
| `BatchRecoveryEntered`   | batch id, recovery deadline (ledger sequence)                | `execute_batch_partial`                      |
| `FailedOpRetried`        | batch id, op id, retry count, success flag                   | `retry_failed_operation`                     |
| `FailedOpSkipped`        | batch id, op id                                              | `skip_failed_operation`                      |
| `BatchFullyComplete`     | batch id                                                     | retry/skip when no failures remain           |

For backwards compatibility the contract also publishes legacy short-topic events whose payload is just the ID: `schedule`, `schbatch`, `execute`, `exbatch` and `cancel`. The admin updates publish `upd_dly` and `upd_win` with `(old, new)`. New integrations should prefer the typed events above.

## Errors

`TimelockError` is a `#[contracterror]`; callers see these as contract error codes.

| Code | Name                            | Raised when                                                                                                              |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | `PredecessorNotDone`            | The operation's single predecessor has not been executed yet.                                                            |
| 2    | `PredecessorNotFound`           | A referenced predecessor, operation or batch does not exist (also used when `execute*` is given an unknown ID).          |
| 3    | `OperationExpired`              | The window has elapsed, or the operation or batch was already executed or cancelled.                                     |
| 10   | `DependencyCycleDetected`       | Reserved for dependency cycles.                                                                                          |
| 11   | `PredecessorNotComplete`        | `now < ready_at` (not yet ready), or not all `schedule_with_deps` predecessors are done.                                 |
| 12   | `BatchInRecoveryMode`           | `retry_failed_operation` called on a batch that is not in recovery mode.                                                 |
| 13   | `BatchRecoveryExpired`          | `retry_failed_operation` called at or after `recovery_deadline`.                                                         |
| 14   | `OperationAlreadyInBatch`       | Reserved for an operation that already belongs to a batch.                                                               |
| 15   | `InvalidPredecessorList`        | A recovery call names an `op_id` that is not in the batch's failed list.                                                 |
| 16   | `IncompletePredecessorClosure`  | `validate_dependency_dag` input is missing transitive predecessors.                                                      |

Some preconditions are plain panics rather than `TimelockError` values: `already initialized`, `not initialized`, `only governor`, `only admin`, `not authorized` (cancel), `delay too short`, `operation already scheduled`, `empty batch`, `length mismatch`, `invalid state`, `operation not found`, `delay must be positive` and `delay + execution_window overflow`.

Note that several error names are reused for neighbouring conditions (for example `PredecessorNotComplete` is also the "not ready yet" error). Match on the code together with the entrypoint you called.

## Deployment order

The Timelock needs the Governor's address and the Governor needs the Timelock's, so deploy first and initialize second:

1. Deploy `sorogov_token_votes`, `sorogov_timelock` and `sorogov_governor` WASMs to obtain all three contract IDs (see [deployment.md](./deployment.md)).
2. Initialize `token-votes`.
3. Initialize the **Timelock** with the admin, the **Governor ID**, `min_delay` and `execution_window`.
4. Initialize the **Governor** with the **Timelock ID** and the votes token.
5. Point the contracts the DAO controls (for example the treasury) at the Timelock as their privileged caller, so that only timelocked proposals can change them.
6. Verify with `min_delay()`, `execution_window()`, `governor()` and `admin()` before announcing the deployment.

Initialization is one-shot: a second `initialize` panics with `already initialized`, so double-check the addresses before sending the transaction. For local test setups, `scripts/deploy-e2e-testnet.sh` uses `min_delay = 0` for instant execution; never use that on mainnet.

## Related documentation

- [Architecture](./architecture.md)
- [Deployment guide](./deployment.md)
- [Security notes](./security.md)

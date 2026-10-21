# Token Votes Wrapper

## Overview

The **Token Votes Wrapper** (`contracts/token-votes-wrapper`) adds governance voting to an existing SEP-41 token that has no voting features of its own. Holders deposit ("wrap") the underlying token and receive a 1:1 **wrapped balance** that carries voting power. Withdrawing ("unwrapping") burns the wrapped balance and returns the underlying token.

It exposes the same voting interface as `token-votes` (`get_votes`, `get_past_votes`, `get_past_total_supply`, `get_delegate`, `delegate`), so a governor can use it as its votes token without any change.

Use the wrapper when your community already holds a Stellar asset and you want to govern with it without migrating to a new token. Use `token-votes` when you control the token itself.

## How it works

```
Underlying SEP-41 token ──deposit / wrap──▶ Wrapper (holds the tokens)
                                               │ 1:1 wrapped balance
                                               ▼
                                  voting power → delegatee's checkpoints
Underlying SEP-41 token ◀─withdraw / unwrap── Wrapper
```

### Wrapping and unwrapping

- `deposit` and `wrap` both transfer `amount` of the underlying token from the caller to the wrapper contract and credit the caller's wrapped balance by the same amount (1:1, no fee).
- `withdraw` and `unwrap` both debit the caller's wrapped balance and transfer the same amount of underlying token back.
- The two pairs differ **only in the event they emit**. `deposit`/`withdraw` emit short-symbol events carrying the underlying token address; `wrap`/`unwrap` emit `Wrapped`/`Unwrapped` events intended for indexers and frontends. Pick one pair and use it consistently so your indexer sees a single event family.
- `amount` must be positive. A withdrawal larger than the caller's wrapped balance panics with `InsufficientBalance`.
- The wrapped balance is an **internal ledger entry**, readable with `get_depositor_balance`. It is not itself a transferable SEP-41 token. To move voting power to someone else, use `delegate`.

### How wrapped balances become voting power

Voting power is tracked in per-account **checkpoints** (ledger sequence plus votes), the same model as `token-votes`:

1. On `deposit`/`wrap`, the amount is added to the voting power of the caller's **delegatee**. If the caller has never delegated, the delegatee is the caller (an automatic self-delegation).
2. On `withdraw`/`unwrap`, the amount is removed from the delegatee's voting power.
3. On `delegate(delegator, delegatee)`, the delegator's full wrapped balance moves from the old delegatee's checkpoint to the new one. Delegating to the current delegatee emits the event but moves nothing.
4. Every change also updates a global **total supply** checkpoint (the sum of all wrapped balances).

Checkpoints are written per ledger: several changes in the same ledger update a single entry. Governors read `get_past_votes(account, ledger)` and `get_past_total_supply(ledger)` at a proposal's snapshot ledger, which uses binary search over the checkpoints and returns the value at or before that ledger. Because the snapshot is taken from checkpoints, wrapping tokens after a proposal's snapshot ledger does not add voting power to that proposal.

### Withdrawal locks

To stop a voter from voting and then immediately unwrapping, the **admin** can call `lock_withdrawal(caller, from, end_ledger)`. While `ledger.sequence() <= end_ledger`, `withdraw` and `unwrap` for `from` panic with `withdrawal locked: tokens used in active proposal`. Deposits and delegation are not affected by a lock.

The admin is the address passed to `initialize`. It is intended to be the governor, so locks are applied for accounts with voting power in an active proposal. The contract does not call back into the governor on its own: whichever address is the admin must invoke `lock_withdrawal`.

## Public entrypoints

### Setup

| Function | Auth | Description |
| -------- | ---- | ----------- |
| `initialize(admin, underlying_token)` | `admin` | One-time setup. Stores the admin and the underlying SEP-41 token. A second call panics with `already initialized`. |

### Wrapping

| Function | Auth | Description |
| -------- | ---- | ----------- |
| `deposit(from, amount)` | `from` | Transfers `amount` of the underlying token in and credits `from`'s wrapped balance and voting power. Emits `deposit`. |
| `wrap(caller, amount)` | `caller` | Same accounting as `deposit`. Emits `Wrapped`. |
| `withdraw(from, amount)` | `from` | Debits the wrapped balance and voting power and returns the underlying token. Fails while a withdrawal lock is active. Emits `withdraw`. |
| `unwrap(caller, amount)` | `caller` | Same accounting as `withdraw`. Emits `Unwrapped`. |

### Delegation and locks

| Function | Auth | Description |
| -------- | ---- | ----------- |
| `delegate(delegator, delegatee)` | `delegator` | Moves `delegator`'s entire wrapped balance of voting power to `delegatee` and records the delegation. Emits `delegate`. |
| `lock_withdrawal(caller, from, end_ledger)` | `caller` must be the admin | Blocks `from` from withdrawing through ledger `end_ledger` (inclusive). Emits `lock_wd`. |

### Views

| Function | Description |
| -------- | ----------- |
| `get_votes(account) -> i128` | Latest voting power of `account` (the latest checkpoint), or `0`. |
| `get_past_votes(account, ledger) -> i128` | Voting power at or before `ledger`. |
| `get_past_total_supply(ledger) -> i128` | Total wrapped supply at or before `ledger`. |
| `get_delegate(account) -> Address` | The account's delegatee; `account` itself if it has never delegated. |
| `get_depositor_balance(account) -> i128` | The wrapped balance deposited by `account`. |
| `underlying_token() -> Address` | The underlying SEP-41 token. Fails with `NotInitialized` before `initialize`. |

Note that `get_votes` reports **delegated-in** voting power, not the account's own balance. An account that delegated everything away has `get_votes == 0` but a non-zero `get_depositor_balance`.

## Events

| Topics | Data | Emitted by |
| ------ | ---- | ---------- |
| `("deposit", from)` | `(underlying_token, amount)` | `deposit` |
| `("withdraw", from)` | `(underlying_token, amount)` | `withdraw` |
| `("Wrapped", caller)` | `(caller, amount)` | `wrap` |
| `("Unwrapped", caller)` | `(caller, amount)` | `unwrap` |
| `("delegate", delegator)` | `(old_delegatee, new_delegatee)` | `delegate` |
| `("lock_wd",)` | `(from, end_ledger, current_ledger)` | `lock_withdrawal` |

`old_delegatee` is the delegator itself when it had not delegated before.

## Errors

Typed errors are returned as `WrapperError`:

| Code | Name | Raised when |
| ---- | ---- | ----------- |
| 1 | `NotInitialized` | The contract is used before `initialize` (a deposit, withdrawal, `lock_withdrawal`, or `underlying_token` call). |

Other failures are panics with a message:

| Message | Raised when |
| ------- | ----------- |
| `already initialized` | `initialize` is called twice. |
| `amount must be positive` | `deposit`, `wrap`, `withdraw`, or `unwrap` is called with `amount <= 0`. |
| `InsufficientBalance` | A withdrawal exceeds the caller's wrapped balance. |
| `withdrawal locked: tokens used in active proposal` | A withdrawal is attempted while a lock is active. |
| `only admin can lock withdrawals` | `lock_withdrawal` is called by an address other than the admin. |

Underlying-token failures, such as a missing balance or allowance on the underlying token, surface as errors from that token contract.

## Deployment order

1. **Have the underlying SEP-41 token address.** Its holders will wrap it. No change to that token is needed.
2. **Deploy the wrapper** (`sorogov_token_votes_wrapper.wasm`, built by `make build-wasm`) and call `initialize(admin, underlying_token)`. The admin should be the governor, or an address controlled by governance. If the governor does not exist yet, deploy it first (see step 3) and initialize the wrapper last.
3. **Deploy the timelock and governor.** Pass the **wrapper's address** as the governor's votes token. See [deployment.md](./deployment.md).
4. **Verify** with `scripts/verify-deployment.sh` (set `WRAPPER_ADDRESS`) and by reading `underlying_token()`.
5. **Tell holders to wrap before the snapshot.** Voting power exists only from the ledger in which a deposit or delegation lands, so holders must wrap (and delegate, if they want someone else to vote) before a proposal's snapshot ledger.

Because `initialize` fixes the admin and underlying token permanently, double-check both addresses before calling it.

## Example

```bash
# Initialize with the governor as admin
stellar contract invoke --id $WRAPPER --source deployer --network testnet -- \
  initialize --admin $GOVERNOR --underlying_token $UNDERLYING_TOKEN

# Holder wraps 1,000 units (the amount uses the underlying token's decimals)
stellar contract invoke --id $WRAPPER --source holder --network testnet -- \
  wrap --caller $HOLDER --amount 1000

# Holder delegates voting power to another address
stellar contract invoke --id $WRAPPER --source holder --network testnet -- \
  delegate --delegator $HOLDER --delegatee $DELEGATE

# Read voting power
stellar contract invoke --id $WRAPPER --network testnet -- get_votes --account $DELEGATE

# Holder unwraps (fails while a withdrawal lock is active)
stellar contract invoke --id $WRAPPER --source holder --network testnet -- \
  unwrap --caller $HOLDER --amount 1000
```

## TypeScript SDK

`WrapperClient` in `sdk/src/wrapper.ts` provides typed access to the wrapper from the SDK.

## Related

- [Architecture](./architecture.md#wrapper-contract)
- [Deployment](./deployment.md)
- [Vote escrow](./vote-escrow.md), another source of voting weight

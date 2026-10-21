# Liquidity

## Overview

The **Liquidity** contract (`contracts/liquidity`) maintains protocol-owned, two-asset liquidity pools for governance-controlled outcome tokens. Each pool is a constant-product AMM (`reserve_a × reserve_b = k`) with a configurable swap fee. Liquidity providers deposit both assets and receive LP shares; traders swap one asset for the other against the pool.

Privileged setup, meaning pool creation, pool initialization and fee changes, is restricted to a single **governor** address. In a production deployment these actions are meant to be executed through the governor → timelock → liquidity proposal flow, so the DAO decides which pools exist and what they charge. Providing liquidity, removing liquidity and swapping are open to any address that authorizes the call.

## Concepts

### Pools are keyed by an outcome pair

A pool is identified by two `u32` outcome ids. The pair is **order-insensitive**: `(1, 2)` and `(2, 1)` resolve to the same pool. Internally the contract normalizes to `(lo, hi)`, where `lo` is the smaller id.

- `reserve_a` holds the reserve of the **lower** outcome id.
- `reserve_b` holds the reserve of the **higher** outcome id.

The contract accepts amounts in the caller's own ordering and returns results in that same ordering, so you do not need to sort ids yourself. Values read back from `get_pool` are always in normalized `(lo, hi)` order.

### Two-step pool registration

A pool needs two governor-only records before anyone can add liquidity:

1. `create_pool` registers the **token addresses** for the pair.
2. `initialize_pool` creates the pool's **accounting** (empty reserves) with a starting fee.

`add_liquidity` fails with `PoolNotFound` unless both exist.

### Pricing and fees

For a swap of `amount_in`:

```
amount_out = amount_in × reserve_out / (reserve_in + amount_in)
fee        = amount_out × fee_bps / 10_000
payout     = amount_out − fee
```

The fee is taken from the **output** amount. The pool's `reserve_out` decreases only by `payout`, so the fee stays in the reserves and accrues to liquidity providers. `fee_bps` is capped at `MAX_FEE_BPS = 1_000` (10%).

### LP shares

- **First deposit:** LP shares minted equal the deposit on the lower-id side (`lo_amount`), and both sides are credited in full.
- **Later deposits:** the contract enforces the current reserve ratio. It computes the exact higher-id amount required, `required_hi = lo_amount × reserve_b / reserve_a`, and credits only that amount. Your `hi_amount` acts as a maximum. LP shares minted are `lo_amount × total_lp_supply / reserve_a`.

Shares are tracked per `(provider, lo, hi)` and are **not** transferable tokens; they are an internal ledger entry read with `get_lp_position`.

### Constants

| Constant          | Value       | Meaning                                                         |
| ----------------- | ----------- | --------------------------------------------------------------- |
| `MIN_LIQUIDITY`   | `1_000`     | Minimum deposit per side, and minimum reserve left after a partial withdrawal |
| `MAX_FEE_BPS`     | `1_000`     | Maximum swap fee (10%), in basis points                          |
| `TTL_LEDGERS`     | `6_307_200` | Persistent-storage TTL extension applied on every write          |

## Public entrypoints

### Setup (governor only)

All three require `caller.require_auth()` and `caller == governor`, otherwise they fail with `NotGovernor`.

| Function | Description |
| -------- | ----------- |
| `initialize(governor)` | One-time setup. Stores the governor address. `governor` must authorize. Fails with `AlreadyInitialized` on a second call. |
| `create_pool(caller, outcome_a, outcome_b, token_a, token_b)` | Registers the SEP-41 token for each outcome. `token_a` belongs to `outcome_a` and `token_b` to `outcome_b`; the contract re-orders them to match `(lo, hi)`. Fails with `AlreadyInitialized` if tokens are already registered for the pair. |
| `initialize_pool(caller, outcome_a, outcome_b, fee_bps)` | Creates the pool with zero reserves and the starting fee, and records `PoolMetadata`. Fails with `FeeTooHigh` if `fee_bps > 1_000`, or `AlreadyInitialized` if the pool exists. |
| `update_pool_fee(caller, outcome_a, outcome_b, fee_bps)` | Changes the fee of an existing pool. Fails with `FeeTooHigh` or `PoolNotFound`. Emits `PoolFeeUpdated`. |

### Liquidity provision

| Function | Description |
| -------- | ----------- |
| `add_liquidity(provider, outcome_a, outcome_b, amount_a, amount_b, min_lp_tokens_out) -> (i128, i128)` | Deposits both assets and mints LP shares. Returns `(lp_tokens, deposit_b)`, where `deposit_b` is the amount of the `outcome_b` asset actually consumed. For later deposits this can be less than `amount_b`; the excess is never transferred. `min_lp_tokens_out` is a slippage guard. |
| `remove_liquidity(provider, outcome_a, outcome_b, lp_tokens) -> (i128, i128)` | Burns `lp_tokens` and pays out the proportional share of both reserves. Returns `(amount_a, amount_b)` in the caller's ordering. |

`add_liquidity` checks, in order: both amounts are positive (`InvalidAmount`); the lower-id side is at least `MIN_LIQUIDITY` (`BelowMinLiquidity`); the pool exists (`PoolNotFound`); for later deposits, `required_hi` is at least `MIN_LIQUIDITY` (`BelowMinLiquidity`), `hi_amount >= required_hi` (`ImbalancedDeposit`) and the minted shares are non-zero (`DepositTooSmall`); finally minted shares meet `min_lp_tokens_out` (`SlippageExceeded`).

`remove_liquidity` rejects `lp_tokens <= 0` (`InvalidAmount`) and more shares than the provider holds (`InsufficientShares`). A partial withdrawal that would leave either reserve non-zero but below `MIN_LIQUIDITY` fails with `BelowMinLiquidity`; withdrawing everything is allowed.

### Swaps

| Function | Description |
| -------- | ----------- |
| `swap(trader, outcome_in, outcome_out, amount_in, min_amount_out) -> i128` | Sells `amount_in` of the `outcome_in` asset for the `outcome_out` asset and returns the amount received, net of fee. `min_amount_out` is the slippage guard. |

Fails with `SameOutcome` (identical ids), `InvalidAmount` (`amount_in <= 0`), `PoolNotFound`, `InsufficientReserves` (either reserve is zero), `PoolTokensNotFound` or `SlippageExceeded`.

### Views

| Function | Description |
| -------- | ----------- |
| `governor() -> Address` | The configured governor. Fails with `PoolNotFound` if `initialize` has not been called. |
| `get_pool(outcome_a, outcome_b) -> Pool` | Pool state: `reserve_a`, `reserve_b`, `total_lp_supply`, `fee_bps`. Fails with `PoolNotFound`. |
| `get_pool_safe(outcome_a, outcome_b) -> Option<Pool>` | Same as `get_pool` but returns `None` instead of failing. Use it to test whether a pool exists. |
| `get_pool_metadata(outcome_a, outcome_b) -> PoolMetadata` | `created_by`, `created_ledger`, `created_timestamp`, recorded by `initialize_pool`. Fails with `PoolNotFound`. |
| `get_lp_position(provider, outcome_a, outcome_b) -> i128` | LP shares held by `provider`. Returns `0` if the provider has no position. |
| `get_price(outcome_a, outcome_b) -> i128` | `reserve_b × 10_000 / reserve_a`, i.e. the price of the lower-id asset in higher-id units, scaled by 10,000. Returns `0` while `reserve_a` is zero. Fails with `PoolNotFound`. |

Because reserves are stored in `(lo, hi)` order, `get_price(1, 2)` and `get_price(2, 1)` return the **same** value.

## Events

| Event topic | Topics | Data | Emitted by |
| ----------- | ------ | ---- | ---------- |
| `LiquidityAdded` | `("LiquidityAdded", provider)` | `LiquidityAddedEvent { provider, outcome_a, outcome_b, amount_a, amount_b, lp_tokens_minted }` | `add_liquidity` |
| `LiquidityRemoved` | `("LiquidityRemoved", provider)` | `LiquidityRemovedEvent { provider, outcome_a, outcome_b, amount_a, amount_b, lp_tokens_burned }` | `remove_liquidity` |
| `Swap` | `("Swap", trader)` | `SwapEvent { trader, outcome_in, outcome_out, amount_in, amount_out, fee }` | `swap` |
| `PoolFeeUpdated` | `("PoolFeeUpdated",)` | `PoolFeeUpdatedEvent { outcome_a, outcome_b, old_fee_bps, new_fee_bps }` | `update_pool_fee` |

Notes:

- `LiquidityAdded` and `LiquidityRemoved` report `outcome_a`/`outcome_b` and the amounts in **normalized** `(lo, hi)` order, even if the caller passed the pair reversed.
- `Swap` reports the outcomes in the direction the trader requested. `amount_out` is net of `fee`.
- `PoolFeeUpdated` has no indexed address topic.

## Errors

| Code | Name | Raised when |
| ---- | ---- | ----------- |
| 1 | `InvalidAmount` | An amount is zero or negative |
| 2 | `InsufficientShares` | The provider holds fewer LP shares than requested |
| 3 | `ImbalancedDeposit` | `hi_amount` is below the amount needed to match the pool ratio |
| 4 | `ArithmeticOverflow` | A checked add/multiply overflowed |
| 5 | `PoolNotFound` | The pool or its metadata does not exist (also returned by `governor()` before `initialize`) |
| 6 | `InsufficientReserves` | A swap targets a pool with an empty reserve |
| 7 | `SameOutcome` | `swap` was called with identical `outcome_in` and `outcome_out` |
| 8 | `BelowMinLiquidity` | A deposit side, or a post-withdrawal reserve, is under `MIN_LIQUIDITY` |
| 9 | `AlreadyInitialized` | Contract, token registration or pool already exists |
| 10 | `FeeTooHigh` | `fee_bps` exceeds `1_000` |
| 11 | `SlippageExceeded` | Output is below `min_lp_tokens_out` or `min_amount_out` |
| 12 | `NotGovernor` | A governor-only function was called by another address |
| 13 | `DepositTooSmall` | The deposit would mint zero LP shares |
| 14 | `PoolTokensNotFound` | A pool exists but its token pair was never registered |

## Deployment order

1. **Deploy and initialize `token-votes`, `timelock` and `governor`** so a governor address exists. See [deployment.md](./deployment.md). `scripts/deploy-testnet.sh` deploys the liquidity WASM (as `LIQUIDITY_ADDRESS`) after the governor, treasury and factory.
2. **Deploy the liquidity contract** (`sorogov_liquidity.wasm`).
3. **Call `initialize(governor)`** with the governor address that will own privileged actions. Until this runs, every governor-only call fails.
4. **For each market pair**, run the governor-gated registration:
   1. `create_pool(governor, outcome_a, outcome_b, token_a, token_b)`
   2. `initialize_pool(governor, outcome_a, outcome_b, fee_bps)`
5. **Seed liquidity** with `add_liquidity`. The first deposit sets the initial price (`reserve_b / reserve_a`), so choose the ratio deliberately.
6. Confirm with `scripts/verify-deployment.sh`, which checks `liquidity.governor`.

On a real network, steps 3 and 4 should be performed by a governance proposal executed through the timelock rather than by a single key.

Both tokens must be SEP-41 tokens, and each provider or trader must have authorized the contract to pull the relevant amounts (the contract calls `transfer` from the caller's account).

## Example

```bash
# Governor registers a pool for outcomes 1 and 2 with a 0.30% fee
stellar contract invoke --id $LIQUIDITY_ADDRESS --source governor --network testnet -- \
  create_pool --caller $GOVERNOR --outcome_a 1 --outcome_b 2 \
  --token_a $TOKEN_YES --token_b $TOKEN_NO

stellar contract invoke --id $LIQUIDITY_ADDRESS --source governor --network testnet -- \
  initialize_pool --caller $GOVERNOR --outcome_a 1 --outcome_b 2 --fee_bps 30

# A provider seeds the pool at a 1:1 price
stellar contract invoke --id $LIQUIDITY_ADDRESS --source provider --network testnet -- \
  add_liquidity --provider $PROVIDER --outcome_a 1 --outcome_b 2 \
  --amount_a 100000 --amount_b 100000 --min_lp_tokens_out 100000

# A trader swaps 1000 of outcome 1 for outcome 2, requiring at least 900 out
stellar contract invoke --id $LIQUIDITY_ADDRESS --source trader --network testnet -- \
  swap --trader $TRADER --outcome_in 1 --outcome_out 2 \
  --amount_in 1000 --min_amount_out 900

# Read the price and a provider's shares
stellar contract invoke --id $LIQUIDITY_ADDRESS --network testnet -- get_price --outcome_a 1 --outcome_b 2
stellar contract invoke --id $LIQUIDITY_ADDRESS --network testnet -- \
  get_lp_position --provider $PROVIDER --outcome_a 1 --outcome_b 2
```

## TypeScript SDK

`LiquidityClient` in `sdk/src/liquidity.ts` wraps the read methods (`getPool`, `getPoolSafe`, `getLpPosition`, `getPrice`) and the user-facing write methods (`addLiquidityWithSign`, `removeLiquidityWithSign`, `swapWithSign`). Governor-only setup functions are invoked through the Stellar CLI or a governance proposal.

## Related

- [Architecture](./architecture.md#liquidity-contract)
- [Deployment](./deployment.md)
- [Security](./security.md)

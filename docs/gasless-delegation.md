# Gasless Delegation

**Gasless delegation** allows token holders to delegate their voting power **without paying transaction fees**. Users sign a delegation permit off-chain with their wallet, then a trusted relayer submits it on-chain and pays the network fee on their behalf.

This feature is equivalent to Ethereum's EIP-712 `delegateBySig` and is part of the broader effort to reduce friction for governance participation.

---

## Overview

| Component | Description |
|---|---|
| **DelegationPermit** | Off-chain signed instruction to delegate voting power |
| **Backend relayer** | Trusted service that submits permits and pays fees |
| **On-chain whitelist** | Optional relayer access control in token-votes contract |
| **Daily permit limits** | Per-delegator quota enforced by the backend |
| **Frontend modal** | `GaslessDelegateModal` component for user interaction |

**Key benefit:** Users delegate without holding XLM for fees or understanding transaction mechanics.

---

## Architecture

```
User Wallet                Backend Relayer              Token-Votes Contract
    |                            |                              |
    |  1. Sign permit off-chain  |                              |
    |--------------------------->|                              |
    |   (SorobanAuthorizationEntry)                            |
    |                            |                              |
    |                            |  2. POST /relayer/delegate   |
    |                            |     - Check daily quota      |
    |                            |     - Validate permit        |
    |                            |                              |
    |                            |  3. Submit transaction       |
    |                            |----------------------------->|
    |                            |     (relayer pays fee)       |
    |                            |                              |
    |                            |                              | 4. Verify permit
    |                            |                              |    - Signature
    |                            |                              |    - Nonce
    |                            |                              |    - Expiry
    |                            |                              |    - Chain/contract ID
    |                            |                              |    - Relayer whitelist
    |                            |                              |
    |                            |<-----------------------------|
    |                            |   5. Log permit submission   |
    |                            |      (relayer_permit_log)    |
    |                            |                              |
    |<---------------------------|                              |
    |   6. Return tx hash        |                              |
```

---

## Permit Format

A `DelegationPermit` is a structured message signed by the delegator:

```rust
pub struct DelegationPermit {
    pub delegator: Address,     // Who is delegating
    pub delegatee: Address,     // Who receives the voting power
    pub nonce: u64,             // Sequential, replay-protection nonce
    pub expiry_ledger: u32,     // Permit expires after this ledger
    pub chain_id: BytesN<32>,   // Network ID (prevents cross-network replay)
    pub contract_id: Address,   // Token-votes contract (prevents cross-contract replay)
}
```

### Field Order

**CRITICAL:** Struct fields must be serialized **alphabetically** by field name when converting to `ScVal`:

```
chain_id → contract_id → delegatee → delegator → expiry_ledger → nonce
```

This matches Soroban's `#[contracttype]` derive convention. The SDK (`sdk/src/delegation-sig.ts`) and backend (`backend/src/routes/relayer.ts`) both enforce this order.

### Domain Separator

The contract computes a domain separator for EIP-712-style replay protection:

```
domain_separator = sha256("nebgov::DelegationPermit" || contract_id || network_id)
```

The full permit hash (informational only, not used for verification):

```
permit_hash = sha256(domain_separator || sha256(xdr_encode(permit)))
```

**Note:** On-chain verification uses Soroban's native `Address::require_auth_for_args`, not manual signature checking. The permit hash is exposed via `compute_permit_hash()` for off-chain tooling (relayer deduplication, debugging).

---

## Signing Flow

The user signs a `SorobanAuthorizationEntry`, **not a raw 64-byte signature**. This leverages Soroban's native authorization framework and transparently supports:

- Classic Ed25519 accounts
- Multisig accounts
- Smart-wallet contracts

### Why Not `ed25519_verify`?

Soroban's `Address` type is intentionally opaque — there is no way to extract a raw public key from an `Address` on-chain. Using `require_auth_for_args` delegates verification to the host, which:

1. Supports all address types (account, multisig, contract)
2. Uses audited, host-verified cryptography
3. Handles Soroban's native replay protection automatically

The signed auth entry is scoped to:

```
(contract_address, function_name, arguments)
```

Where `function_name` is `"delegate_by_sig"` or `"delegate_batch_by_sig"` and `arguments` is `(permit,)`.

**Crucially:** The auth entry does **not** include the relayer address. Any relayer can submit the same signed permit (relayer-agnostic design).

### SDK Usage

```typescript
import { DelegationSigClient } from "@nebgov/sdk";

const client = new DelegationSigClient({
  votesAddress: "CVOTES...",
  network: "testnet",
});

// Get current nonce for the delegator
const nonce = await client.getNonce(delegatorAddress);

// Sign permit off-chain (browser wallet)
const { permit, authEntry } = await client.signDelegationPermit({
  delegator: {
    publicKey: walletPublicKey,
    sign: async (preimage) => {
      // Delegate to wallet's auth-entry signer
      const signed = await walletKit.signAuthEntry(preimage.toXDR("base64"));
      return Buffer.from(signed, "base64");
    },
  },
  delegatee: "GDELEGATEE...",
  expiryLedger: currentLedger + 100_000, // ~5-6 days
});

// Send to relayer
const result = await fetch("/relayer/delegate", {
  method: "POST",
  body: JSON.stringify({
    permit: {
      delegator: permit.delegator,
      delegatee: permit.delegatee,
      nonce: permit.nonce.toString(),
      expiryLedger: permit.expiryLedger,
      chainId: permit.chainId.toString("base64"),
      contractId: permit.contractId,
    },
    signature: authEntry, // base64 XDR of SorobanAuthorizationEntry
  }),
});
```

For server-side signing (testing, scripts):

```typescript
import { Keypair } from "@stellar/stellar-sdk";

const delegatorKeypair = Keypair.fromSecret("S...");

const { permit, authEntry } = await client.signDelegationPermit({
  delegator: delegatorKeypair,
  delegatee: "GDELEGATEE...",
  expiryLedger: currentLedger + 100_000,
});
```

---

## Backend Relayer

The relayer is an Express.js service (`backend/src/routes/relayer.ts`) with two endpoints:

### Endpoints

#### `POST /relayer/delegate`

Submit a single signed permit.

**Request:**

```json
{
  "permit": {
    "delegator": "GDELEGATOR...",
    "delegatee": "GDELEGATEE...",
    "nonce": "0",
    "expiryLedger": 123456,
    "chainId": "base64-encoded-32-bytes",
    "contractId": "CVOTES..."
  },
  "signature": "base64-XDR-of-SorobanAuthorizationEntry"
}
```

**Response (success):**

```json
{
  "txHash": "abc123...",
  "nonce": 1
}
```

**Response (rate limit exceeded):**

```json
{
  "error": "Relayer daily permit limit reached for this address"
}
```

#### `POST /relayer/delegate-batch`

Submit up to 20 permits atomically in a single transaction.

**Request:**

```json
{
  "permits": [
    { "delegator": "G...", "delegatee": "G...", "nonce": "0", ... },
    { "delegator": "G...", "delegatee": "G...", "nonce": "1", ... }
  ],
  "signatures": ["base64-auth-entry-1", "base64-auth-entry-2"]
}
```

**Response (success):**

```json
{
  "txHash": "abc123...",
  "nonces": [1, 2]
}
```

**Notes:**

- All permits succeed or all fail (atomic)
- Permits and signatures arrays must have the same length
- Each signature must be signed with `forBatch: true`

### Rate Limiting

The relayer enforces **two layers** of rate limiting:

#### 1. IP-Based Rate Limit

- **Window:** 1 minute
- **Limit:** 10 requests per IP
- **Purpose:** Prevent Sybil attackers from rotating delegator addresses to exhaust the relayer's fee budget

Implemented with `express-rate-limit`, using `x-forwarded-for` header when behind a proxy.

#### 2. Per-Delegator Daily Quota

- **Window:** Rolling 24 hours
- **Default Limit:** 5 permits per delegator (configurable via `RELAYER_DAILY_PERMIT_LIMIT`)
- **Purpose:** Prevent abuse of the relayer's sponsored fee budget

Enforced by querying the `relayer_permit_log` table:

```sql
SELECT COUNT(*) FROM relayer_permit_log
WHERE delegator = $1 AND created_at > NOW() - INTERVAL '1 day'
```

**Concurrency handling:**

The backend uses PostgreSQL advisory locks (`pg_advisory_xact_lock`) to serialize quota checks for the same delegator across concurrent requests:

```typescript
await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
  delegator,
]);
```

This ensures two simultaneous requests for the same delegator don't both read the same pre-log count and both succeed when only one should.

For batch submissions, all unique delegators are locked in sorted order to prevent deadlocks.

### Permit Log

Every successfully submitted permit is recorded in the `relayer_permit_log` table:

```sql
CREATE TABLE relayer_permit_log (
    id              BIGSERIAL PRIMARY KEY,
    delegator       TEXT        NOT NULL,
    delegatee       TEXT        NOT NULL,
    nonce           NUMERIC     NOT NULL,
    tx_hash         TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_relayer_permit_log_delegator_nonce
    ON relayer_permit_log (delegator, nonce);
```

The unique index on `(delegator, nonce)` ensures idempotency — replaying the same permit is a no-op.

### Error Handling

The relayer translates contract errors into human-readable messages:

| Contract Error | Code | Message |
|---|---|---|
| `InvalidSignature` | 10 | Invalid or missing delegation signature |
| `NonceAlreadyUsed` | 11 | Permit nonce has already been used or invalidated |
| `PermitExpired` | 12 | Delegation permit has expired |
| `InvalidDelegationPermit` | 13 | Delegation permit is malformed or out of order |
| `RelayerNotWhitelisted` | 14 | Relayer is not whitelisted to submit signed permits |
| `InvalidChainId` | 15 | Permit was signed for a different network |
| `InvalidContractId` | 16 | Permit was signed for a different contract |

**Structural validation:**

Before submitting, the relayer checks that:

1. The signature parses as a well-formed `SorobanAuthorizationEntry`
2. The entry uses `sorobanCredentialsAddress` credentials
3. The signing address matches the permit's `delegator` field

This catches malformed input before spending an RPC round-trip.

---

## On-Chain Validation

When the relayer submits a transaction calling `delegate_by_sig`, the token-votes contract validates the permit:

### Validation Steps

1. **Expiry:** `env.ledger().sequence() <= permit.expiry_ledger`
2. **Chain ID:** `permit.chain_id == env.ledger().network_id()`
3. **Contract ID:** `permit.contract_id == env.current_contract_address()`
4. **Nonce:** `permit.nonce == current_nonce(delegator)` and not already used
5. **Relayer whitelist:** `is_relayer_allowed(relayer)` (if whitelist enabled)
6. **Signature:** `permit.delegator.require_auth_for_args((permit,))`

If any check fails, the transaction reverts with the corresponding error.

### Nonce Management

Each delegator has a sequential nonce stored in persistent storage:

```rust
DataKey::Nonce(delegator) → u64
```

- Starts at `0` for new delegators
- Increments by `1` on each successful permit
- Used nonces are tracked separately: `DataKey::UsedNonce(delegator, nonce) → bool`

**Invalidating all permits:**

A delegator can call `invalidate_all_permits()` to bump their nonce by `1,000,000`, invalidating every outstanding unsigned permit in one transaction:

```typescript
const result = await client.invalidateAllPermits();
```

This is a **paid transaction** (not gasless) — the delegator signs and submits it themselves.

### Relayer Whitelist

The token-votes contract supports optional relayer access control:

```rust
DataKey::RelayerWhitelistEnabled → bool
DataKey::RelayerWhitelist(relayer) → bool
```

When the whitelist is **enabled**, only addresses explicitly whitelisted by the admin may submit permits. When **disabled** (default), any address may relay.

**Admin functions:**

```rust
pub fn set_relayer_whitelist_enabled(admin: Address, enabled: bool);
pub fn set_relayer_whitelisted(admin: Address, relayer: Address, whitelisted: bool);
pub fn is_relayer_allowed(relayer: Address) -> bool;
```

**SDK usage:**

```typescript
// Enable whitelist
await client.setRelayerWhitelistEnabled(adminKeypair, true);

// Whitelist a relayer
await client.setRelayerWhitelisted(
  adminKeypair,
  "GRELAYER...",
  true
);

// Check if relayer is allowed
const allowed = await client.isRelayerAllowed("GRELAYER...");
```

**Use cases:**

- **Public testnet:** Whitelist disabled, anyone can relay (reduces centralization)
- **Mainnet:** Whitelist enabled, only trusted service accounts relay (prevents spam/abuse)

---

## Operator Setup

### Environment Variables

Add to `backend/.env`:

```bash
# Relayer account (must be funded with XLM for transaction fees)
RELAYER_SECRET_KEY=S...

# Daily permit limit per delegator (default: 5)
RELAYER_DAILY_PERMIT_LIMIT=5

# Token-votes contract address
TOKEN_VOTES_CONTRACT_ID=CVOTES...

# Network configuration
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
```

### Funding the Relayer Account

The relayer account must hold sufficient XLM to cover transaction fees. Each permit submission costs:

- **Base fee:** 100 stroops (0.00001 XLM)
- **Resource fees:** Variable, typically ~10,000 stroops (0.001 XLM)

**Budget calculation:**

```
Expected permits/day = 1,000
Cost per permit = ~0.001 XLM
Daily budget = 1 XLM
Monthly buffer = 30 XLM
```

Fund the relayer with a comfortable buffer:

```bash
stellar account fund GRELAYER... \
  --amount 100 \
  --network testnet
```

**Monitoring:**

Track the relayer's balance and alert when it drops below a threshold:

```bash
stellar account balance GRELAYER... --network testnet
```

### Whitelist Configuration (Optional)

If running on mainnet or restricting access:

```bash
# Enable whitelist on the token-votes contract
stellar contract invoke \
  --id CVOTES... \
  --network mainnet \
  -- set_relayer_whitelist_enabled \
  --admin GADMIN... \
  --enabled true

# Whitelist the relayer
stellar contract invoke \
  --id CVOTES... \
  --network mainnet \
  -- set_relayer_whitelisted \
  --admin GADMIN... \
  --relayer GRELAYER... \
  --whitelisted true
```

### Database Migration

The relayer requires the `relayer_permit_log` table (migration 007):

```bash
cd backend
npm run migrate
```

Verify:

```bash
psql $DATABASE_URL -c "\d relayer_permit_log"
```

### Starting the Backend

```bash
cd backend
npm run dev
```

Verify health:

```bash
curl http://localhost:3001/health
```

Test the relayer endpoint:

```bash
curl -X POST http://localhost:3001/relayer/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "permit": { ... },
    "signature": "..."
  }'
```

---

## Frontend Integration

The `GaslessDelegateModal` component (`app/src/components/GaslessDelegateModal.tsx`) provides a user-friendly interface for gasless delegation.

### Usage

```typescript
import { GaslessDelegateModal } from "@/components/GaslessDelegateModal";

function MyComponent() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button onClick={() => setModalOpen(true)}>
        Delegate for free
      </button>

      <GaslessDelegateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onDelegated={() => {
          // Refresh delegation data
          console.log("Delegation successful!");
        }}
        prefillAddress="GDELEGATEE..."
        topDelegates={leaderboard}
      />
    </>
  );
}
```

### Props

| Prop | Type | Description |
|---|---|---|
| `open` | `boolean` | Modal visibility |
| `onClose` | `() => void` | Close callback |
| `onDelegated` | `() => void` | Success callback (optional) |
| `prefillAddress` | `string` | Pre-fill delegatee address (optional) |
| `topDelegates` | `TopDelegate[]` | Show quick-pick buttons (optional) |

### Expiry Presets

The modal offers four expiry durations:

| Preset | Label | Duration |
|---|---|---|
| `"1week"` | 1 week | 7 days |
| `"1month"` | 1 month | 30 days |
| `"6months"` | 6 months | 182 days |
| `"1year"` | 1 year | 365 days |

Converted to ledgers using `~5 seconds/ledger` approximation.

### Hook: `useGaslessDelegation`

The modal uses `useGaslessDelegation` hook (`app/src/hooks/useGaslessDelegation.ts`):

```typescript
const {
  delegateGasless,
  preflightDelegatee,
  invalidateAllPermits,
  submitting,
  error,
} = useGaslessDelegation();

// Preflight validation (cycle/depth checks)
const result = await preflightDelegatee("GDELEGATEE...");
if (!result.ok) {
  console.error(result.error);
}

// Submit gasless delegation
const { txHash } = await delegateGasless("GDELEGATEE...", "1month");

// Invalidate all pending permits (paid transaction)
await invalidateAllPermits();
```

**Preflight checks:**

Before signing, the hook validates:

1. **Delegation cycle:** Would this create a cycle? (`VotesClient.wouldCreateCycle`)
2. **Delegation depth:** Would this exceed the max depth? (`VotesClient.getChainDepth`)

These read on-chain state and prevent submitting invalid permits.

---

## Failure Modes

### User Errors

| Error | Cause | Resolution |
|---|---|---|
| "Connect your wallet first" | Wallet not connected | Click "Connect wallet" button |
| "Invalid Stellar address" | Malformed delegatee address | Enter valid G... address |
| "This delegation would create a cycle" | Circular delegation chain | Choose different delegatee |
| "Would exceed max delegation depth" | Chain too deep | Choose delegatee with shorter chain |
| "Address is required" | Empty delegatee field | Enter delegatee address |

### Backend Errors

| HTTP Status | Error | Cause | Resolution |
|---|---|---|---|
| 400 | "Malformed authorization signature or delegator mismatch" | Invalid signature XDR or delegator mismatch | Regenerate signature |
| 429 | "Relayer daily permit limit reached for this address" | Exceeded 5 permits/day | Wait 24 hours or contact support |
| 429 | "Too many relayer requests from this IP" | Exceeded 10 req/min from IP | Wait 1 minute |
| 500 | "Failed to submit delegation" | RPC failure or network issue | Retry after a few seconds |

### Contract Errors

| Error | Code | Cause | Resolution |
|---|---|---|---|
| Invalid signature | 10 | Signature verification failed | Regenerate permit with correct signing key |
| Nonce already used | 11 | Permit nonce consumed or invalidated | Fetch current nonce and sign new permit |
| Permit expired | 12 | Current ledger > expiry_ledger | Sign new permit with future expiry |
| Malformed permit | 13 | Nonce out of order | Fetch current nonce and retry |
| Relayer not whitelisted | 14 | Relayer not in whitelist | Contact admin to whitelist relayer |
| Wrong network | 15 | Chain ID mismatch | Sign permit with correct network |
| Wrong contract | 16 | Contract ID mismatch | Sign permit with correct contract address |

### Operational Failures

| Issue | Symptom | Diagnosis | Mitigation |
|---|---|---|---|
| Relayer out of funds | All submissions fail with fee errors | Check relayer account balance | Fund relayer account |
| RPC endpoint down | Timeout or connection errors | Check `STELLAR_RPC_URL` health | Switch to backup RPC URL |
| Database connection lost | Backend crashes or hangs | Check PostgreSQL status | Restart PostgreSQL |
| Relayer whitelist misconfigured | Error 14 on all submissions | Query `is_relayer_allowed(relayer)` | Whitelist the relayer or disable whitelist |

---

## Monitoring and Observability

### Metrics to Track

1. **Daily permit count per delegator**
   ```sql
   SELECT delegator, COUNT(*) as permits
   FROM relayer_permit_log
   WHERE created_at > NOW() - INTERVAL '1 day'
   GROUP BY delegator
   ORDER BY permits DESC;
   ```

2. **Relayer account balance**
   ```bash
   stellar account balance GRELAYER... --network testnet
   ```

3. **Failed permit submissions**
   ```bash
   # Check backend logs for contract errors
   grep "Error in POST /relayer/delegate" logs/backend.log
   ```

4. **Rate limit hits**
   ```bash
   # Check for 429 responses in access logs
   grep "429" logs/access.log | wc -l
   ```

### Alerts

Set up alerts for:

- **Low relayer balance:** < 10 XLM
- **High failure rate:** > 10% of permit submissions fail
- **Quota exhaustion:** Any delegator hits 5 permits/day multiple times
- **IP rate limit abuse:** Same IP hits 429 repeatedly

### Logging

The backend logs all relayer activity:

```javascript
logger.error({ err: error }, "Error in POST /relayer/delegate");
```

Logs include:

- Delegator/delegatee addresses
- Permit nonce
- Contract error codes
- RPC errors
- IP addresses (for rate limiting)

**Privacy:** Do **not** log the full `signature` field (it's large and sensitive).

---

## Security Considerations

### Trust Model

The relayer is a **trusted** service that:

- Pays transaction fees on behalf of users
- Has access to the relayer secret key
- Controls the daily permit quota

**Threat vectors:**

1. **Relayer key compromise:** Attacker could drain relayer funds by spamming invalid permits
   - **Mitigation:** Rate limiting, daily quotas, monitoring
2. **Quota exhaustion:** Attacker rotates delegator addresses to exhaust fee budget
   - **Mitigation:** IP-based rate limiting, Cloudflare/firewall rules
3. **Frontend spoofing:** Malicious frontend tricks users into signing permits for the wrong delegatee
   - **Mitigation:** Users should verify delegatee address before signing
4. **Relayer censorship:** Relayer refuses to submit valid permits
   - **Mitigation:** Users can always fall back to paid `delegate()` transaction

### Best Practices

- **Rotate relayer keys** periodically (e.g., monthly)
- **Use separate relayer accounts** for testnet and mainnet
- **Monitor relayer balance** and alert on anomalies
- **Whitelist relayers on mainnet** to prevent unauthorized submissions
- **Audit permit logs** regularly for suspicious patterns
- **Display clear warnings** in the frontend about what the user is signing

---

## Comparison to Paid Delegation

| Feature | Gasless Delegation | Paid Delegation |
|---|---|---|
| User pays fee | ❌ No | ✅ Yes |
| Requires XLM balance | ❌ No | ✅ Yes |
| Censorship-resistant | ⚠️ Relayer can refuse | ✅ Fully permissionless |
| Latency | ~5-10 seconds (backend + RPC) | ~5-10 seconds (direct RPC) |
| Rate limiting | ✅ Yes (5/day default) | ❌ No |
| Offline signing | ✅ Yes | ⚠️ Requires wallet connection |
| Batch support | ✅ Up to 20 permits | ❌ One at a time |
| Nonce management | ✅ Sequential, invalidate-all | ✅ Sequential, invalidate-all |

**When to use gasless:**

- Onboarding new users who don't have XLM
- Mobile apps with limited wallet support
- UX-first governance participation

**When to use paid:**

- Maximum decentralization and censorship resistance
- Backend relayer is unavailable or untrusted
- Delegating on behalf of a contract (relayer can't pay for contract invocations)

---

## Troubleshooting

### "Permit nonce has already been used or invalidated"

**Cause:** The nonce in the permit has already been consumed by a previous delegation.

**Solution:**

1. Fetch the current nonce:
   ```typescript
   const nonce = await client.getNonce(delegator);
   ```
2. Sign a new permit with the updated nonce

### "Relayer is not whitelisted to submit signed permits"

**Cause:** The relayer whitelist is enabled, but the relayer account is not whitelisted.

**Solution:**

1. Check if whitelist is enabled:
   ```typescript
   const enabled = await client.relayer_whitelist_enabled();
   ```
2. Whitelist the relayer:
   ```typescript
   await client.setRelayerWhitelisted(adminKeypair, relayerAddress, true);
   ```
3. Or disable the whitelist:
   ```typescript
   await client.setRelayerWhitelistEnabled(adminKeypair, false);
   ```

### "Relayer daily permit limit reached for this address"

**Cause:** The delegator has submitted 5 permits in the last 24 hours.

**Solution:**

- **Wait:** Quota resets after 24 hours from the first permit
- **Fallback:** Use paid `delegate()` transaction instead
- **Increase limit:** Operator can raise `RELAYER_DAILY_PERMIT_LIMIT` (carefully — higher limits increase relayer's fee exposure)

### Permits not being submitted

**Diagnosis:**

1. Check backend health:
   ```bash
   curl http://localhost:3001/health
   ```
2. Check relayer account balance:
   ```bash
   stellar account balance GRELAYER... --network testnet
   ```
3. Check backend logs:
   ```bash
   tail -f logs/backend.log | grep relayer
   ```
4. Test RPC connectivity:
   ```bash
   curl $STELLAR_RPC_URL/health
   ```

### Signature verification fails

**Cause:** The signed auth entry doesn't match the permit.

**Common mistakes:**

- **Wrong nonce:** Fetch current nonce before signing
- **Wrong expiry:** Ensure `expiryLedger` is in the future
- **Wrong network:** `chainId` must match the target network
- **Wrong contract:** `contractId` must match the token-votes contract
- **Wrong function:** Use `forBatch: false` for `/delegate`, `forBatch: true` for `/delegate-batch`

**Debug:**

```typescript
// Log permit before signing
console.log("Signing permit:", {
  nonce: await client.getNonce(delegator),
  chainId: client.chainId().toString("hex"),
  contractId: client.votesAddress,
});
```

---

## References

- **Contract:** `contracts/token-votes/src/delegation_sig.rs`
- **Backend:** `backend/src/routes/relayer.ts`
- **SDK:** `sdk/src/delegation-sig.ts`
- **Frontend:** `app/src/components/GaslessDelegateModal.tsx`
- **Hook:** `app/src/hooks/useGaslessDelegation.ts`
- **Migration:** `backend/migrations/007_add_relayer_permit_log.sql`
- **Tests:** `contracts/token-votes/src/delegation_sig_tests.rs`
- **Issue:** [#772](https://github.com/nebgov/nebgov/issues/772) — Signed vote delegation

---

## See Also

- [Split Delegation](./split-delegation.md) — Delegate percentages to multiple delegatees
- [Vote Escrow](./vote-escrow.md) — Time-locked voting power boost
- [Co-sponsorship](./co-sponsorship.md) — Pool voting power to meet proposal threshold
- [Treasury Streams](./treasury-streams.md) — Recurring payments from treasury (mentions relayer account reuse)
- [Local Development](./local-development.md) — Setting up the full stack locally (includes relayer env vars)

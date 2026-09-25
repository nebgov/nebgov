# @nebgov/cli

Terminal-based governance workflows for NebGov on Stellar. The `nebgov` binary reads governance state, casts votes,
manages delegation and vote-escrow locks, and claims voting rewards, all from the command line.

## Install

```bash
npm install -g @nebgov/cli
nebgov --help
```

Working from a checkout of this monorepo instead:

```bash
pnpm install
pnpm --filter @nebgov/cli dev -- --help
```

## Usage

```
nebgov [--human] [--dry-run] [--config <path>] <command> <subcommand> [options]
```

| Global option | Description |
| --- | --- |
| `--human` | Print tables and `key: value` lines instead of JSON (the default). |
| `--dry-run` | For write commands that support it, print the action that would be sent instead of submitting a transaction. |
| `--config <path>` | Config file to load. Defaults to `$NEBGOV_CONFIG`, then `~/.nebgov/config.json`. |

Output is JSON by default, with `bigint` values rendered as strings, so it pipes cleanly into `jq`.

## Configuration

Settings are resolved in this order, later sources winning: built-in defaults (`network: "testnet"`), the JSON config
file, then environment variables.

Example `~/.nebgov/config.json`:

```json
{
  "network": "testnet",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "governorAddress": "C...",
  "timelockAddress": "C...",
  "votesAddress": "C...",
  "treasuryAddress": "C...",
  "voteEscrowAddress": "C...",
  "votingRewardsAddress": "C...",
  "backendUrl": "http://localhost:4000",
  "keypairFile": "~/.nebgov/keys/voter.secret",
  "defaultAccount": "G..."
}
```

### Environment variables

| Variable | Config key | Used by |
| --- | --- | --- |
| `NEBGOV_CONFIG` | n/a | Path to the config file (overridden by `--config`). |
| `NEBGOV_NETWORK` | `network` | All commands. One of `mainnet`, `testnet`, `futurenet`. Defaults to `testnet`. |
| `NEBGOV_RPC_URL` | `rpcUrl` | All commands. Soroban RPC endpoint override. |
| `NEBGOV_GOVERNOR_ADDRESS` | `governorAddress` | `proposals`, `vote`, `delegate` (required); passed to the other clients when set. |
| `NEBGOV_TIMELOCK_ADDRESS` | `timelockAddress` | Same as governor. |
| `NEBGOV_VOTES_ADDRESS` | `votesAddress` | Same as governor. |
| `NEBGOV_TREASURY_ADDRESS` | `treasuryAddress` | `treasury` (required). |
| `NEBGOV_VOTE_ESCROW_ADDRESS` | `voteEscrowAddress` | `vote-escrow` (required). |
| `NEBGOV_VOTING_REWARDS_ADDRESS` | `votingRewardsAddress` | `voting-rewards` (required). |
| `NEBGOV_BACKEND_URL` | `backendUrl` | `voting-rewards`. Required by `claims`, optional for `epochs`. |
| `NEBGOV_KEYPAIR_FILE` | `keypairFile` | Default signer for write commands when `--keypair` is omitted. |
| `NEBGOV_DEFAULT_ACCOUNT` | `defaultAccount` | Default address for read commands that take an account. |
| `NEBGOV_PROPOSAL_BONDS_ADDRESS` | n/a (env only) | `proposal-bonds` |
| `NEBGOV_CONVICTION_VOTING_ADDRESS` | n/a (env only) | `conviction-voting` |
| `NEBGOV_OPTIMISTIC_GOVERNOR_ADDRESS` | n/a (env only) | `optimistic-governor` |
| `NEBGOV_TREASURY_STRATEGIES_ADDRESS` | n/a (env only) | `treasury-strategies` |
| `NEBGOV_SIGNAL_ANCHOR_ADDRESS` | n/a (env only) | `signaling-polls` |
| `NEBGOV_CO_SPONSORSHIP_ADDRESS` | n/a (env only) | `drafts` |
| `NEBGOV_INDEXER_URL` | n/a (env only) | `drafts` (indexer endpoint for draft queries). |

A missing required value fails with `Missing required config: <field>`.

### Keypair files

`--keypair <file>` (or `NEBGOV_KEYPAIR_FILE`) points at a file containing either a raw Stellar secret (`S...`) or JSON
with the secret under `secret`, `secretKey` or `privateKey`. A leading `~/` is expanded. Keep these files out of
version control.

## Commands

Each example assumes the relevant addresses are already configured. `G...` and `C...` stand for real Stellar
account and contract addresses.

### proposals

```bash
nebgov proposals list --limit 10
nebgov proposals list --proposer G...
nebgov proposals get 42
nebgov proposals create \
  --title "Raise quorum to 5%" \
  --description-file ./proposal.md \
  --target C... --fn update_config \
  --calldata-hex 0a0b \
  --keypair ~/.nebgov/keys/proposer.secret
```

`create` hashes the description file, submits a single-call proposal, and prints `{ "proposalId": ... }`. It supports
`--dry-run`.

### vote

```bash
nebgov vote cast 42 for --keypair ~/.nebgov/keys/voter.secret   # for | against | abstain
nebgov vote status 42 --voter G...
```

### delegate

```bash
nebgov delegate to G... --keypair ~/.nebgov/keys/voter.secret
nebgov delegate show G...
```

`show` prints the address's current delegatee and voting power.

### treasury

```bash
nebgov treasury balance
nebgov treasury balance --token C... --viewer G...
nebgov treasury batch-transfer --token C... --recipients ./payouts.csv --keypair ~/.nebgov/keys/signer.secret
```

`--recipients` is a CSV file with one `address,amount` row per line (amounts in base units). Supports `--dry-run`.

### proposal-bonds

```bash
nebgov proposal-bonds list --limit 20
nebgov proposal-bonds settings
```

### conviction-voting

```bash
nebgov conviction-voting proposal 7
nebgov conviction-voting history 7
```

### optimistic-governor

```bash
nebgov optimistic-governor list --status ChallengeWindow
nebgov optimistic-governor get 3
nebgov optimistic-governor config
```

### treasury-strategies

```bash
nebgov treasury-strategies list --limit 20
nebgov treasury-strategies get 1
```

### signaling-polls

```bash
nebgov signaling-polls list --status active   # active | closed
nebgov signaling-polls get 5
nebgov signaling-polls results 5
```

### drafts

Co-sponsorship drafts that gather backing before becoming a proposal.

```bash
nebgov drafts list --status active --page 1 --limit 20   # active | finalized | cancelled | expired
nebgov drafts show 12
nebgov drafts create --description-file ./draft.md --target C... --fn update_config --keypair ~/.nebgov/keys/author.secret
nebgov drafts co-sponsor 12 --keypair ~/.nebgov/keys/sponsor.secret
nebgov drafts withdraw 12 --keypair ~/.nebgov/keys/sponsor.secret
nebgov drafts finalize 12 --keypair ~/.nebgov/keys/author.secret
nebgov drafts cancel 12 --keypair ~/.nebgov/keys/author.secret
```

`create` also accepts `--metadata-uri` and `--calldata-hex`.

### vote-escrow

Time-locked voting power.

```bash
nebgov vote-escrow lock --amount 1000000000 --duration 518400 --keypair ~/.nebgov/keys/voter.secret
nebgov vote-escrow increase --amount 500000000 --keypair ~/.nebgov/keys/voter.secret
nebgov vote-escrow extend --new-end-ledger 2000000 --keypair ~/.nebgov/keys/voter.secret
nebgov vote-escrow withdraw --keypair ~/.nebgov/keys/voter.secret
nebgov vote-escrow show G...
```

`--duration` is in ledgers. `show` prints the lock and current voting power; with no address it falls back to
`NEBGOV_DEFAULT_ACCOUNT`, then to the configured keypair.

### voting-rewards

```bash
nebgov voting-rewards epochs                 # current epoch and available pool
nebgov voting-rewards epochs --epoch 3
nebgov voting-rewards claims G...            # claimable rewards for an address
nebgov voting-rewards claim --epoch 3 --amount 250000 --proof '["ab12...","cd34..."]' --keypair ~/.nebgov/keys/voter.secret
nebgov voting-rewards fund --amount 5000000000 --keypair ~/.nebgov/keys/funder.secret
```

`--proof` accepts a JSON array of hex strings or a comma-separated list. `claim` supports `--dry-run`.

## Tests

```bash
pnpm --filter @nebgov/cli test
```

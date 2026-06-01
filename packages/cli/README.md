# @nebgov/cli

Terminal CLI for NebGov governance operations on Stellar/Soroban.

## Install

```bash
pnpm --filter @nebgov/cli build
pnpm --filter @nebgov/cli link --global
```

Then run:

```bash
nebgov --help
nebgov --version
```

## Configuration

The CLI resolves config in this order (later values override earlier ones):

1. `~/.nebgov/config.json` (or `--config <path>`)
2. Environment variables

| Environment variable       | Config key          | Description                              |
| -------------------------- | ------------------- | ---------------------------------------- |
| `NEBGOV_NETWORK`           | `network`           | `testnet` \| `mainnet` \| `futurenet`    |
| `NEBGOV_GOVERNOR_ADDRESS`  | `governorAddress`   | Governor contract address                |
| `NEBGOV_TIMELOCK_ADDRESS`  | `timelockAddress`   | Timelock contract address                |
| `NEBGOV_VOTES_ADDRESS`     | `votesAddress`      | Token-votes contract address             |
| `NEBGOV_TREASURY_ADDRESS`  | `treasuryAddress`   | Treasury contract address                |
| `NEBGOV_RPC_URL`           | `rpcUrl`            | Soroban RPC endpoint                     |
| `NEBGOV_KEYPAIR_FILE`      | `keypairFile`       | Path to keypair JSON or secret-key file  |
| `NEBGOV_DEFAULT_ACCOUNT`   | `defaultAccount`    | Default public key for read operations   |

Example `~/.nebgov/config.json`:

```json
{
  "network": "testnet",
  "governorAddress": "C...",
  "timelockAddress": "C...",
  "votesAddress": "C...",
  "treasuryAddress": "C...",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "keypairFile": "~/.stellar/keypair.json",
  "defaultAccount": "G..."
}
```

## Global Flags

| Flag              | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `--human`         | Human-readable output instead of JSON                    |
| `--dry-run`       | Print planned action without submitting any transactions |
| `--config <path>` | Path to config file (default: `~/.nebgov/config.json`)   |
| `--version`       | Print CLI version and exit                               |
| `--help`          | Show help for any command                                |

## Output Modes

By default all commands output JSON. Pass `--human` for table/key-value output.

```bash
nebgov proposals list --human
nebgov treasury balance --human
```

## Commands

---

### `proposals list`

List governance proposals submitted by a specific proposer.

**Synopsis**

```
nebgov proposals list [options]
```

**Options**

| Flag                | Required | Default | Description                               |
| ------------------- | -------- | ------- | ----------------------------------------- |
| `--proposer <addr>` | No       | —       | Filter by proposer address                |
| `--limit <n>`       | No       | `20`    | Maximum number of proposals to return     |

Proposer defaults to `NEBGOV_DEFAULT_ACCOUNT` or the public key in your keypair file if not set.

**Examples**

```bash
# List your own proposals (resolved from config keypair)
nebgov proposals list

# List proposals by a specific address, human-readable
nebgov proposals list --proposer GABC123... --human

# Return up to 5 proposals as JSON
nebgov proposals list --proposer GABC123... --limit 5
```

---

### `proposals get`

Fetch full details of a single proposal, including current state and vote tallies.

**Synopsis**

```
nebgov proposals get <id>
```

**Arguments**

| Argument | Description    |
| -------- | -------------- |
| `<id>`   | Proposal ID    |

**Examples**

```bash
# Get proposal 42 as JSON
nebgov proposals get 42

# Get proposal 7, human-readable
nebgov proposals get 7 --human
```

---

### `proposals create`

Submit a new governance proposal.

**Synopsis**

```
nebgov proposals create --title <title> --description-file <file> --target <addr> --fn <name> [options]
```

**Options**

| Flag                        | Required | Description                                        |
| --------------------------- | -------- | -------------------------------------------------- |
| `--title <title>`           | ✅        | Proposal title / summary                           |
| `--description-file <file>` | ✅        | Path to markdown or text file with full description|
| `--target <address>`        | ✅        | Target contract address to call on execution       |
| `--fn <name>`               | ✅        | Target function name                               |
| `--calldata-hex <hex>`      | No       | Hex-encoded calldata bytes (default: empty)        |
| `--keypair <file>`          | No       | Keypair file (falls back to `NEBGOV_KEYPAIR_FILE`) |

**Examples**

```bash
# Create a proposal on testnet
nebgov proposals create \
  --title "Q2 Budget Update" \
  --description-file ./proposal.md \
  --target CABC123... \
  --fn update_config \
  --keypair ~/.stellar/keypair.json

# Dry-run to preview without submitting
nebgov proposals create \
  --title "Upgrade treasury threshold" \
  --description-file ./upgrade.md \
  --target CABC123... \
  --fn set_threshold \
  --calldata-hex 0x0000000a \
  --dry-run
```

---

### `vote cast`

Cast a vote on an existing proposal.

**Synopsis**

```
nebgov vote cast <proposalId> <support> --keypair <file>
```

**Arguments**

| Argument      | Description                        |
| ------------- | ---------------------------------- |
| `<proposalId>`| Proposal ID                        |
| `<support>`   | `for` \| `against` \| `abstain`    |

**Options**

| Flag               | Required | Description        |
| ------------------ | -------- | ------------------ |
| `--keypair <file>` | ✅        | Keypair file path  |

**Examples**

```bash
# Vote in favour of proposal 42
nebgov vote cast 42 for --keypair ~/.stellar/keypair.json

# Vote against proposal 7, dry-run to preview
nebgov vote cast 7 against --keypair ~/.stellar/keypair.json --dry-run
```

---

### `vote status`

Check a voter's receipt for a proposal (whether they voted and how).

**Synopsis**

```
nebgov vote status <proposalId> [options]
```

**Arguments**

| Argument       | Description  |
| -------------- | ------------ |
| `<proposalId>` | Proposal ID  |

**Options**

| Flag                | Required | Description                                         |
| ------------------- | -------- | --------------------------------------------------- |
| `--voter <address>` | No       | Voter address (defaults to config default account)  |

**Examples**

```bash
# Check your own vote on proposal 42
nebgov vote status 42

# Check a specific address's vote on proposal 7
nebgov vote status 7 --voter GABC123...
```

---

### `delegate to`

Delegate your voting power to another address.

**Synopsis**

```
nebgov delegate to <address> --keypair <file>
```

**Arguments**

| Argument    | Description        |
| ----------- | ------------------ |
| `<address>` | Delegatee address  |

**Options**

| Flag               | Required | Description       |
| ------------------ | -------- | ----------------- |
| `--keypair <file>` | ✅        | Keypair file path |

**Examples**

```bash
# Delegate voting power to a trusted address
nebgov delegate to GXYZ789... --keypair ~/.stellar/keypair.json

# Preview the delegation without submitting
nebgov delegate to GXYZ789... --keypair ~/.stellar/keypair.json --dry-run
```

---

### `delegate show`

Show the current delegatee and voting power of an address.

**Synopsis**

```
nebgov delegate show <address>
```

**Arguments**

| Argument    | Description      |
| ----------- | ---------------- |
| `<address>` | Delegator address|

**Examples**

```bash
# Show delegation info for your own address
nebgov delegate show GABC123...

# Show delegation info, human-readable
nebgov delegate show GABC123... --human
```

---

### `treasury balance`

Inspect treasury state: owners, threshold, transaction count, and optionally the amount spent in the current period for a given token.

**Synopsis**

```
nebgov treasury balance [options]
```

**Options**

| Flag                | Required | Description                                          |
| ------------------- | -------- | ---------------------------------------------------- |
| `--viewer <address>`| No       | Simulation viewer account (defaults to config)       |
| `--token <address>` | No       | Token contract address to inspect spending metrics   |

**Examples**

```bash
# View treasury state
nebgov treasury balance

# Include spending metrics for a specific token
nebgov treasury balance --token CABC123... --human

# Use a specific viewer account
nebgov treasury balance --viewer GABC123... --token CABC123...
```

---

### `treasury batch-transfer`

Submit a batch of token transfers from the treasury using a CSV file.

**Synopsis**

```
nebgov treasury batch-transfer --token <address> --recipients <csv> --keypair <file>
```

**Options**

| Flag                   | Required | Description                             |
| ---------------------- | -------- | --------------------------------------- |
| `--token <address>`    | ✅        | Token contract address                  |
| `--recipients <csv>`   | ✅        | Path to CSV file with `address,amount` rows |
| `--keypair <file>`     | ✅        | Keypair file path                       |

**CSV format**

```csv
GAAAA...,1000000
GBBBB...,2500000
```

Each row is `<stellar-address>,<amount-in-stroops>`.

**Examples**

```bash
# Execute batch transfer
nebgov treasury batch-transfer \
  --token CABC123... \
  --recipients ./recipients.csv \
  --keypair ~/.stellar/keypair.json

# Dry-run to preview recipients and amounts before sending
nebgov treasury batch-transfer \
  --token CABC123... \
  --recipients ./recipients.csv \
  --keypair ~/.stellar/keypair.json \
  --dry-run
```

---

## Exit Codes

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| `0`  | Success                                                   |
| `1`  | Error — missing arguments, contract error, network failure|
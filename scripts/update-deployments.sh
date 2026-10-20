#!/usr/bin/env bash
# scripts/update-deployments.sh
# Updates docs/deployments.md with addresses from an environment file.

set -euo pipefail

ENV_FILE="${1:-.env.testnet}"
DOCS_FILE="docs/deployments.md"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: Environment file $ENV_FILE not found."
  exit 1
fi

# Load variables (ignoring comments)
set -a
# shellcheck source=/dev/null
source <(grep -v '^#' "$ENV_FILE" | sed -E 's/^(.+)=(.+)$/\1="\2"/')
set +a

# Helper to update a row in the testnet table
update_row() {
  local contract_name="$1"
  local address="$2"
  
  if [[ -n "$address" ]]; then
    echo "Updating $contract_name address to $address"
    # Escaping for sed
    local escaped_addr="\\\`$address\\\`"
    # Use sed to replace the line containing the contract name in the Testnet section
    # This assumes the contract name is in the first column of the table
    sed -i "s|^\(| $contract_name | \)[^|]*\( |\)|\1$escaped_addr\2|" "$DOCS_FILE"
  fi
}

echo "Updating $DOCS_FILE using $ENV_FILE..."

update_row "Governor" "${GOVERNOR_ADDRESS:-}"
update_row "Timelock" "${TIMELOCK_ADDRESS:-}"
update_row "Token Votes" "${TOKEN_VOTES_ADDRESS:-}"
update_row "Treasury" "${TREASURY_ADDRESS:-}"
update_row "Governor Factory" "${FACTORY_ADDRESS:-}"

echo "Done."

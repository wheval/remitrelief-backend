#!/usr/bin/env bash
#
# Builds and deploys a single RemitRelief escrow contract instance to
# Stellar testnet for one campaign.
#
# Usage:
#   ./deploy-testnet.sh \
#     --source <deployer-identity-or-secret> \
#     --token <token-contract-id> \
#     --recipient <recipient-address> \
#     --verifiers <addr1,addr2,...> \
#     --milestone-amounts <amt1,amt2,...>
#
# Example:
#   ./deploy-testnet.sh \
#     --source alice \
#     --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
#     --recipient GDRECIPIENT... \
#     --verifiers GVERIFIER1...,GVERIFIER2... \
#     --milestone-amounts 5000,7500,7500

set -euo pipefail

SOURCE=""
TOKEN=""
RECIPIENT=""
VERIFIERS=""
MILESTONE_AMOUNTS=""
NETWORK="testnet"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --recipient) RECIPIENT="$2"; shift 2 ;;
    --verifiers) VERIFIERS="$2"; shift 2 ;;
    --milestone-amounts) MILESTONE_AMOUNTS="$2"; shift 2 ;;
    --network) NETWORK="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$SOURCE" || -z "$TOKEN" || -z "$RECIPIENT" || -z "$VERIFIERS" || -z "$MILESTONE_AMOUNTS" ]]; then
  echo "Missing required argument. Usage:" >&2
  echo "  $0 --source <identity> --token <contract-id> --recipient <address> --verifiers <a,b> --milestone-amounts <1,2,3>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WASM_PATH="$CRATE_DIR/target/wasm32v1-none/release/remitrelief_escrow.wasm"

# Use `stellar contract build --optimize` rather than a plain
# `cargo build --target wasm32-unknown-unknown`. Recent rustc versions
# emit wasm with the reference-types/multivalue proposals enabled by
# default on wasm32 targets, which the Soroban host's wasm validator does
# not accept; `stellar contract build` targets wasm32v1-none (a
# Soroban-specific target) and `--optimize` normalizes the output so it
# passes validation on deploy.
echo "==> Building contract (release, wasm32v1-none, optimized)"
(cd "$CRATE_DIR" && stellar contract build --optimize)

if [[ ! -f "$WASM_PATH" ]]; then
  echo "Build did not produce expected wasm at $WASM_PATH" >&2
  exit 1
fi

# The stellar CLI's "implicit CLI" for contract constructor/invoke args
# expects Vec<T> arguments as a JSON array string. i128 values are passed
# as JSON strings (not bare numbers) to avoid floating-point precision
# loss on large amounts.
IFS=',' read -ra VERIFIER_ARRAY <<< "$VERIFIERS"
IFS=',' read -ra AMOUNT_ARRAY <<< "$MILESTONE_AMOUNTS"

verifiers_json="["
for i in "${!VERIFIER_ARRAY[@]}"; do
  [[ $i -gt 0 ]] && verifiers_json+=","
  verifiers_json+="\"${VERIFIER_ARRAY[$i]}\""
done
verifiers_json+="]"

amounts_json="["
for i in "${!AMOUNT_ARRAY[@]}"; do
  [[ $i -gt 0 ]] && amounts_json+=","
  amounts_json+="\"${AMOUNT_ARRAY[$i]}\""
done
amounts_json+="]"

echo "==> Deploying escrow contract to $NETWORK"
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- \
  --token "$TOKEN" \
  --recipient "$RECIPIENT" \
  --verifiers "$verifiers_json" \
  --milestone_amounts "$amounts_json")

echo "==> Deployed escrow contract: $CONTRACT_ID"
echo "$CONTRACT_ID"

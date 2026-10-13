#!/usr/bin/env bash
# Test and compile the circuits, then copy the artifacts the app loads.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.nargo/bin:$PATH"

for circuit in sealed_bid open_bid; do
  (cd "circuits/$circuit" && nargo test && nargo compile)
  cp "circuits/$circuit/target/$circuit.json" "artifacts/noir/$circuit.json"
done

(cd artifacts/noir && sha256sum *.json > SHA256SUMS)
echo "Updated artifacts/noir/sealed_bid.json and artifacts/noir/open_bid.json"

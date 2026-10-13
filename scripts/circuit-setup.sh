#!/usr/bin/env bash
# Install the pinned Noir toolchain. Requires curl and a network connection.
set -euo pipefail
NOIR_VERSION="1.0.0-beta.9"
if ! command -v noirup >/dev/null 2>&1; then
  curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
  export PATH="$HOME/.nargo/bin:$PATH"
fi
noirup --version "$NOIR_VERSION"
nargo --version
echo "If 'nargo' is not found, add \$HOME/.nargo/bin to PATH."

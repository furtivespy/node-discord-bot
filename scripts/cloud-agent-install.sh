#!/usr/bin/env bash
# Prepares a Cursor cloud agent VM (Ubuntu) so `npm run verify` works.
# Referenced by `install` in .cursor/environment.json. Safe to re-run.
#
# - Node.js at the version pinned in .nvmrc and npm at packageManager in package.json.
# - The native libraries `canvas` builds against, same as .github/workflows/test.yml.
# - Dependencies from package-lock.json with git SSH rewritten to HTTPS.
set -euo pipefail

cd "$(dirname "$0")/.."

NODE_VERSION="$(tr -d '[:space:]' < .nvmrc)"
NPM_VERSION="$(sed -n 's/.*"packageManager": *"npm@\([^"]*\)".*/\1/p' package.json)"
if [ -z "$NODE_VERSION" ] || [ -z "$NPM_VERSION" ]; then
  echo "Missing .nvmrc or packageManager npm@ pin in package.json" >&2
  exit 1
fi

sudo apt-get update -qq
sudo apt-get install --no-install-recommends -y \
  build-essential ca-certificates curl git openssl pkg-config python-is-python3 \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

if [ "$(node -v 2>/dev/null || true)" != "v${NODE_VERSION}" ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) NODE_ARCH="x64" ;;
    aarch64|arm64) NODE_ARCH="arm64" ;;
    *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
  esac
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    | sudo tar -xJ -C /usr/local --strip-components=1
fi

if [ "$(npm -v 2>/dev/null || true)" != "$NPM_VERSION" ]; then
  sudo npm install -g "npm@${NPM_VERSION}"
fi

git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
git config --global url."https://github.com/".insteadOf "git@github.com:"
npm ci

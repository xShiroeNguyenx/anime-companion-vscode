#!/usr/bin/env bash
# Build Desktop Companion sidecar -> bump version -> package .vsix
# -> keep latest 10 -> install into VS Code
# Usage:
#   ./build-install.sh              -> patch bump (0.1.4 -> 0.1.5)
#   ./build-install.sh minor        -> minor bump (0.1.4 -> 0.2.0)
#   ./build-install.sh major        -> major bump (0.1.4 -> 1.0.0)
#   ./build-install.sh --no-bump    -> keep current version, just rebuild

set -euo pipefail

cd "$(dirname "$0")"

REPO_ROOT="$(pwd)"
BUMP_TYPE="${1:-patch}"

# Keep build scratch files off the default system temp so packaging still works
# when the C: drive is tight on space.
TMP_BUILD_DIR="${REPO_ROOT}/.tmp-build"
TMP_NPM_CACHE_DIR="${REPO_ROOT}/.tmp-npm-cache"
mkdir -p "$TMP_BUILD_DIR" "$TMP_NPM_CACHE_DIR"
export TEMP="$TMP_BUILD_DIR"
export TMP="$TMP_BUILD_DIR"
export npm_config_cache="$TMP_NPM_CACHE_DIR"

if [[ -x "./node_modules/.bin/vsce" ]]; then
  VSCE="./node_modules/.bin/vsce"
else
  VSCE="npx vsce"
fi

# 1. Build the Desktop Companion sidecar first so the packaged VSIX contains
# the newest binary.
echo "-> Building Desktop Companion sidecar"
npm run build:desktop-pet

# 2. Bump version
if [[ "$BUMP_TYPE" == "--no-bump" ]]; then
  echo "-> Skipping version bump"
else
  echo "-> Bumping version ($BUMP_TYPE)"
  npm version "$BUMP_TYPE" --no-git-tag-version >/dev/null
fi

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
VSIX="${NAME}-${VERSION}.vsix"

echo "-> Building ${VSIX}"

# 3. Package and prune old VSIX files
$VSCE package --allow-missing-repository --out "$VSIX"
node scripts/cleanup-vsix.js

# 4. Locate the VS Code CLI
USER_NAME="${USER:-${USERNAME:-}}"
CODE_CLI=""
for candidate in \
  "${LOCALAPPDATA:-}/Programs/Microsoft VS Code/bin/code.cmd" \
  "/c/Program Files/Microsoft VS Code/bin/code.cmd" \
  "/c/Users/${USER_NAME}/AppData/Local/Programs/Microsoft VS Code/bin/code.cmd" \
  "$(command -v code 2>/dev/null || true)"; do
  if [[ -n "$candidate" && -f "$candidate" ]]; then
    CODE_CLI="$candidate"
    break
  fi
done

if [[ -z "$CODE_CLI" ]]; then
  echo "X Could not find VS Code CLI ('code'). Install it and retry."
  echo "  In VS Code: Ctrl+Shift+P -> 'Shell Command: Install code command in PATH'"
  exit 1
fi

# 5. Install
echo "-> Installing via: $CODE_CLI"
"$CODE_CLI" --install-extension "$VSIX" --force

echo ""
echo "OK Installed ${VSIX}"
echo "   Reload VS Code: Ctrl+Shift+P -> 'Developer: Reload Window'"

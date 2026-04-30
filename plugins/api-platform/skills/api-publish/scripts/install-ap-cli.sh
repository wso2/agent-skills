#!/usr/bin/env bash
# Install the WSO2 ap CLI to ~/.local/bin and ensure that directory is on PATH.
# Idempotent: safe to re-run. Prints a one-line status summary at the end.
#
# Env overrides:
#   AP_VERSION   — release tag suffix, default "v0.8.0"
#   AP_PREFIX    — install prefix, default "$HOME/.local"
set -euo pipefail

AP_VERSION="${AP_VERSION:-v0.8.0}"
AP_PREFIX="${AP_PREFIX:-$HOME/.local}"
BIN_DIR="$AP_PREFIX/bin"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
[ "$ARCH" = "x86_64" ] && ARCH="amd64"
[ "$ARCH" = "aarch64" ] && ARCH="arm64"

ZIP_NAME="ap-${OS}-${ARCH}-${AP_VERSION}.zip"
ZIP_URL="https://github.com/wso2/api-platform/releases/download/ap/${AP_VERSION}/${ZIP_NAME}"
ZIP_PATH="$HOME/Downloads/ap.zip"
EXTRACT_DIR="$HOME/Downloads/ap-install"

mkdir -p "$BIN_DIR" "$HOME/Downloads"
curl -fLo "$ZIP_PATH" "$ZIP_URL"
unzip -o "$ZIP_PATH" -d "$EXTRACT_DIR" >/dev/null
AP_BIN=$(find "$EXTRACT_DIR" -type f -name "ap" | head -1)
if [ -z "$AP_BIN" ]; then
  echo "ERROR: 'ap' binary not found in $EXTRACT_DIR" >&2
  exit 1
fi
mv "$AP_BIN" "$BIN_DIR/ap"
chmod +x "$BIN_DIR/ap"
rm -rf "$ZIP_PATH" "$EXTRACT_DIR"

# Ensure $BIN_DIR is on PATH for future shells.
SHELL_RC="$HOME/.bashrc"
[[ "${SHELL:-}" == */zsh ]] && SHELL_RC="$HOME/.zshrc"
PATH_STATUS="path-already-configured"
if ! grep -qF "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
  if echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_RC"; then
    PATH_STATUS="path-added-to:$SHELL_RC"
  else
    PATH_STATUS="path-update-failed:$SHELL_RC"
  fi
fi

echo "ap installed at $BIN_DIR/ap (${PATH_STATUS})"

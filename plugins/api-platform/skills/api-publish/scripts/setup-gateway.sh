#!/usr/bin/env bash
# Set up the WSO2 API Platform Gateway under ~/wso2-api-gateway/v<version>/ and
# bring up its Docker Compose stack. Idempotent: if the versioned directory
# already exists, it's reused — no re-download, no destructive changes.
#
# Env overrides:
#   GW_VERSION   — gateway release version, default "1.1.0"
#   GW_PARENT    — parent directory, default "$HOME/wso2-api-gateway"
#   COMPOSE_PROJ — compose project name, default "gateway"
set -euo pipefail

GW_VERSION="${GW_VERSION:-1.1.0}"
GW_PARENT="${GW_PARENT:-$HOME/wso2-api-gateway}"
GW_DIR="$GW_PARENT/v$GW_VERSION"
COMPOSE_PROJ="${COMPOSE_PROJ:-gateway}"

# Pick the available compose variant.
if docker compose version &>/dev/null; then
  COMPOSE=("docker" "compose")
elif docker-compose version &>/dev/null; then
  COMPOSE=("docker-compose")
else
  echo "ERROR: Docker Compose not found. Install Docker Desktop / Rancher Desktop / Colima, or 'docker engine + compose plugin'." >&2
  exit 1
fi

EXTRACTION_STATUS="reused-existing"
if [ ! -d "$GW_DIR" ]; then
  EXTRACTION_STATUS="freshly-extracted"
  mkdir -p "$GW_PARENT"
  ZIP_NAME="wso2apip-api-gateway-${GW_VERSION}.zip"
  ZIP_URL="https://github.com/wso2/api-platform/releases/download/gateway/v${GW_VERSION}/${ZIP_NAME}"
  ZIP_PATH="$HOME/Downloads/${ZIP_NAME}"
  curl -fLo "$ZIP_PATH" "$ZIP_URL"
  unzip -q "$ZIP_PATH" -d "$GW_PARENT"
  rm "$ZIP_PATH"
  mv "$GW_PARENT/wso2apip-api-gateway-${GW_VERSION}" "$GW_DIR"
fi

cd "$GW_DIR"
"${COMPOSE[@]}" -p "$COMPOSE_PROJ" up -d

echo "gateway ready at $GW_DIR (${EXTRACTION_STATUS}); compose project: $COMPOSE_PROJ"

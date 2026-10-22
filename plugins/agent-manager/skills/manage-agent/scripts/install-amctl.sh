#!/usr/bin/env bash

# Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

# Bundled wrapper around the upstream amctl installer.
# - Idempotency: bails out early if amctl is already on PATH.
# - Consent: caller (the skill) prompts the user before invoking this script.
# - Delegation: execs the upstream installer (unpinned to main — weekly cadence makes pinning a treadmill).
# - Status: prints a one-line ✓/✗ result plus a PATH hint.

set -euo pipefail

UPSTREAM_URL="https://raw.githubusercontent.com/wso2/agent-manager/main/scripts/install-amctl.sh"

if command -v amctl >/dev/null 2>&1; then
  echo "✓ amctl already installed at $(command -v amctl) — skipping"
  exit 0
fi

echo "Installing amctl from ${UPSTREAM_URL}"

if ! curl -fsSL "${UPSTREAM_URL}" | sh; then
  echo "✗ amctl install failed — see output above" >&2
  exit 1
fi

if command -v amctl >/dev/null 2>&1; then
  echo "✓ amctl installed at $(command -v amctl)"
else
  echo "✓ amctl installed, but it is not yet on PATH in this shell."
  echo "  Open a new terminal (the installer updates shell rc files), then run: amctl --help"
fi

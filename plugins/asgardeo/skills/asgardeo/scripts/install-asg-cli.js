#!/usr/bin/env node

/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// Install the Asgardeo `asg` CLI by running its own installer.
//
// The installer lives with the CLI's releases, on the release/asgardeo-cli branch
// of wso2/wso2-cli: install.sh for macOS and Linux, install.ps1 for Windows. It
// picks the newest stable asg-v* release, verifies it against checksums.txt, and
// replaces an older install. Keeping it there, rather than here, means a release
// needs no change to this skill, and a person following the release notes and
// this skill run the same installer.
//
// This wrapper skips the install when the asg on PATH is already MIN_VERSION or
// newer, the version this skill is written against. Otherwise it fetches the
// right script for this platform and runs it, which also upgrades an older
// install. The installer's output, including its one-line summary, is its own.
//
// Env, passed straight through to the installer:
//   ASG_VERSION       a release tag to install instead of the newest, e.g. asg-v0.5.0;
//                     setting it also skips the version check above
//   ASG_PRERELEASE    "true" to include release candidates
//   ASG_INSTALL_DIR   where to put the binary (default ~/.local/bin;
//                     %LOCALAPPDATA%\Programs\asg on Windows)
// And for this wrapper:
//   ASG_INSTALLER_BASE_URL  where the scripts are fetched from, for testing an
//                           unmerged installer (https only)
//
// Node builtins only (Node >= 18 for fetch).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_BASE = 'https://raw.githubusercontent.com/wso2/wso2-cli/release/asgardeo-cli/scripts';
const TIMEOUT_MS = 60_000;
const IS_WIN = process.platform === 'win32';
// The oldest asg this skill's commands are written against.
const MIN_VERSION = '0.5.0';

// installedVersion returns the version the asg on PATH reports, or null when
// there is none or it cannot say. Builds before 0.5.0 have no --version, so an
// older install reads as null and is upgraded.
function installedVersion() {
  const run = spawnSync('asg', ['--version'], { encoding: 'utf8', timeout: 15_000 });
  if (run.error || run.status !== 0) return null;
  const m = /asg version v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(run.stdout || '');
  return m ? { text: m[0].replace('asg version ', ''), core: [+m[1], +m[2], +m[3]], pre: m[4] || '' } : null;
}

// atLeast reports whether v is MIN_VERSION or newer. A release candidate of
// MIN_VERSION is older than MIN_VERSION itself.
function atLeast(v) {
  const min = MIN_VERSION.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (v.core[i] !== min[i]) return v.core[i] > min[i];
  }
  return v.pre === '';
}

function baseUrl() {
  const override = process.env.ASG_INSTALLER_BASE_URL;
  if (!override) return DEFAULT_BASE;
  if (new URL(override).protocol !== 'https:') {
    throw new Error('ASG_INSTALLER_BASE_URL must be https.');
  }
  return override.replace(/\/+$/, '');
}

async function main() {
  if (!process.env.ASG_VERSION) {
    const current = installedVersion();
    if (current && atLeast(current)) {
      console.log(`asg ${current.text} is already installed (this skill needs ${MIN_VERSION} or newer); nothing to do.`);
      return;
    }
  }

  const name = IS_WIN ? 'install.ps1' : 'install.sh';
  const url = `${baseUrl()}/${name}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`could not fetch the installer (${res.status} ${res.statusText}): ${url}`);
  const script = await res.text();

  // Written to a file and run from there rather than piped, so the installer
  // keeps stdin free and its errors carry a line number.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asg-installer-'));
  const file = path.join(dir, name);
  try {
    fs.writeFileSync(file, script, { mode: 0o700 });
    const [cmd, args] = IS_WIN
      ? ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file]]
      : ['bash', [file]];
    const run = spawnSync(cmd, args, { stdio: 'inherit' });
    if (run.error) throw new Error(`could not run ${cmd}: ${run.error.message}`);
    process.exitCode = run.status ?? 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // An older asg elsewhere on PATH, such as one copied to /usr/local/bin by
  // hand, still answers to `asg` in this shell and hides the new install.
  if (process.exitCode === 0 && !process.env.ASG_INSTALL_DIR) {
    const current = installedVersion();
    if (current && !atLeast(current)) {
      console.log(`Note: \`asg\` on PATH still reports ${current.text}. An older copy earlier on PATH is hiding the new install; remove it, or put the installer's directory first on PATH.`);
    }
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});

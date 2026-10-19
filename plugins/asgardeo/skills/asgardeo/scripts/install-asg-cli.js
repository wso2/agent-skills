#!/usr/bin/env node
// Install the Asgardeo `asg` CLI from its GitHub release.
//
// Releases live in wso2/wso2-cli under `asg-v<semver>` tags, beside the WSO2 CLI's
// own releases. Each one ships a bare binary per platform (`asg-<os>-<arch>`,
// `.exe` on Windows) and a `checksums.txt`. Idempotent: safe to re-run. Prints one
// status line at the end.
//
// Steps:
//   1. Pick the release: the pinned VERSION below, or the newest `asg-v*` one.
//   2. Download this platform's binary and checksums.txt.
//   3. Verify the binary's SHA-256 against checksums.txt; refuse to install on a mismatch.
//   4. Move it into the install directory and make sure that directory is on PATH.
//
// Env overrides:
//   ASG_VERSION       a release tag such as asg-v0.1.0, or "latest" (default: VERSION)
//   ASG_INSTALL_DIR   where to put the binary (default ~/.local/bin; %LOCALAPPDATA%\Programs\asg on Windows).
//                     When set, the shell profile is left alone and PATH is the caller's to manage.
//   ASG_RELEASE_URL   base URL holding the release assets, for testing a build before it is
//                     published (https, or http on localhost only)
//
// Node builtins only (Node >= 18 for fetch).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

// The CLI version this skill is written against. Bump it in the same change that
// updates the skill for a new CLI release, so the two never drift apart.
const VERSION = 'asg-v0.1.0-rc.1';
const REPO = 'wso2/wso2-cli';
// An optional prerelease suffix (asg-v0.1.0-rc.1) is allowed for ASG_VERSION; "latest" still
// skips releases published as GitHub prereleases.
const TAG_RE = /^asg-v(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const TIMEOUT_MS = 120_000;

const IS_WIN = process.platform === 'win32';
const BIN_NAME = IS_WIN ? 'asg.exe' : 'asg';

function assetName() {
  const osName = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[process.platform];
  const arch = { x64: 'amd64', arm64: 'arm64', ia32: '386', arm: 'arm' }[process.arch];
  if (!osName || !arch || (osName !== 'linux' && !['amd64', 'arm64'].includes(arch))) {
    throw new Error(`no asg release for ${process.platform}/${process.arch}. Supported: Linux amd64, arm64, arm, 386; macOS and Windows amd64, arm64.`);
  }
  return `asg-${osName}-${arch}${IS_WIN ? '.exe' : ''}`;
}

function installDir() {
  if (process.env.ASG_INSTALL_DIR) return path.resolve(process.env.ASG_INSTALL_DIR);
  if (IS_WIN) return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'asg');
  return path.join(os.homedir(), '.local', 'bin');
}

async function get(url, as) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'asgardeo-skill-installer' } });
  if (!res.ok) throw new Error(`download failed (${res.status} ${res.statusText}): ${url}`);
  return as === 'json' ? res.json() : as === 'text' ? res.text() : Buffer.from(await res.arrayBuffer());
}

async function resolveTag() {
  const wanted = process.env.ASG_VERSION || VERSION;
  if (wanted !== 'latest') {
    if (!TAG_RE.test(wanted)) throw new Error(`ASG_VERSION must be a tag like asg-v0.1.0, or "latest" (got "${wanted}").`);
    return wanted;
  }
  // The repository's Latest marker belongs to the WSO2 CLI, so filter by tag instead.
  const releases = await get(`https://api.github.com/repos/${REPO}/releases?per_page=100`, 'json');
  const tags = releases
    .filter((r) => !r.draft && !r.prerelease && TAG_RE.test(r.tag_name))
    .map((r) => r.tag_name)
    .sort((a, b) => {
      const [x, y] = [a, b].map((t) => t.match(TAG_RE).slice(1, 4).map(Number));
      return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
    });
  if (!tags.length) throw new Error(`no published asg-v* release found in ${REPO}.`);
  return tags[0];
}

function releaseBase(tag) {
  const override = process.env.ASG_RELEASE_URL;
  if (!override) return `https://github.com/${REPO}/releases/download/${tag}`;
  const u = new URL(override);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    throw new Error('ASG_RELEASE_URL must be https, or http on localhost.');
  }
  return override.replace(/\/+$/, '');
}

function updatePathUnix(binDir) {
  if ((process.env.PATH || '').split(':').includes(binDir)) return 'path-already-configured';
  const shell = path.basename(process.env.SHELL || '');
  const home = os.homedir();
  const [rc, line] = shell === 'fish'
    ? [path.join(home, '.config', 'fish', 'config.fish'), `set -gx PATH "${binDir}" $PATH`]
    : [path.join(home, shell === 'zsh' ? '.zshrc' : '.bashrc'), `export PATH="${binDir}:$PATH"`];
  let existing = '';
  try { existing = fs.readFileSync(rc, 'utf8'); } catch { /* missing file is fine */ }
  if (existing.includes(binDir)) return 'path-already-configured';
  try {
    fs.mkdirSync(path.dirname(rc), { recursive: true });
    fs.appendFileSync(rc, `\n${line}\n`);
    return `path-added-to:${rc}`;
  } catch {
    return `path-update-failed:${rc}`;
  }
}

function updatePathWindows(binDir) {
  const ps = (script) => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
  const getR = ps(`[Environment]::GetEnvironmentVariable('Path','User')`);
  if (getR.status !== 0) return 'path-update-failed:User-Env';
  const current = (getR.stdout || '').trim();
  if (current.split(';').some((p) => p.toLowerCase() === binDir.toLowerCase())) return 'path-already-configured';
  const sep = current && !current.endsWith(';') ? ';' : '';
  const setR = ps(`[Environment]::SetEnvironmentVariable('Path', ${JSON.stringify(current + sep + binDir)}, 'User')`);
  return setR.status === 0 ? 'path-added-to:User-Env' : 'path-update-failed:User-Env';
}

async function main() {
  const asset = assetName();
  const tag = await resolveTag();
  const base = releaseBase(tag);

  const [binary, sums] = await Promise.all([get(`${base}/${asset}`), get(`${base}/checksums.txt`, 'text')]);
  const line = sums.split('\n').map((l) => l.trim().split(/\s+/)).find((p) => p[1] === asset || p[1] === `*${asset}`);
  if (!line) throw new Error(`${asset} is not listed in checksums.txt for ${tag}; not installing it.`);
  const actual = crypto.createHash('sha256').update(binary).digest('hex');
  if (actual !== line[0].toLowerCase()) throw new Error(`checksum mismatch for ${asset} (${tag}); not installing it.`);

  const dir = installDir();
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, BIN_NAME);
  // Write beside the target, then rename: replacing a binary in place can leave
  // macOS refusing to run it (Killed: 9), and a failed write never half-installs.
  const tmp = path.join(dir, `.${BIN_NAME}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, binary, { mode: 0o755 });
  fs.renameSync(tmp, target);

  const onPath = (process.env.PATH || '').split(path.delimiter).some((p) => path.resolve(p) === dir);
  const pathStatus = onPath ? 'path-already-configured'
    : process.env.ASG_INSTALL_DIR ? `path-not-configured:${dir}`
      : IS_WIN ? updatePathWindows(dir) : updatePathUnix(dir);
  console.log(`asg ${tag} installed at ${target} (checksum verified; ${pathStatus})`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});

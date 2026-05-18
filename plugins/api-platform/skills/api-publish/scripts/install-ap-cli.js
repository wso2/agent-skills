#!/usr/bin/env node
// Install the WSO2 ap CLI on Linux, macOS, or Windows.
// Idempotent: safe to re-run. Prints one status line at the end.
//
// Layout:
//   Linux/macOS: ~/.local/bin/ap                (added to ~/.bashrc or ~/.zshrc)
//   Windows:     %LOCALAPPDATA%\Programs\ap\ap.exe   (added to the User PATH)
//
// Env overrides:
//   AP_VERSION   release tag suffix, default "v0.8.0"
//   AP_PREFIX    install prefix (Linux/macOS only; default "$HOME/.local")

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const AP_VERSION = process.env.AP_VERSION || 'v0.8.0';
const IS_WIN = process.platform === 'win32';

// Map Node platform/arch to the release artifact naming.
const OS_SEGMENT = { linux: 'linux', darwin: 'darwin', win32: 'windows' }[process.platform];
const ARCH_SEGMENT = { x64: 'amd64', arm64: 'arm64' }[process.arch];

if (!OS_SEGMENT || !ARCH_SEGMENT) {
  console.error(`ERROR: unsupported platform/arch: ${process.platform}/${process.arch}`);
  process.exit(1);
}

const BIN_NAME = IS_WIN ? 'ap.exe' : 'ap';
const BIN_DIR = IS_WIN
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'ap')
  : path.join(process.env.AP_PREFIX || path.join(os.homedir(), '.local'), 'bin');

const ZIP_NAME = `ap-${OS_SEGMENT}-${ARCH_SEGMENT}-${AP_VERSION}.zip`;
const ZIP_URL = `https://github.com/wso2/api-platform/releases/download/ap/${AP_VERSION}/${ZIP_NAME}`;
const DOWNLOADS = path.join(os.homedir(), 'Downloads');
const ZIP_PATH = path.join(DOWNLOADS, 'ap.zip');
const EXTRACT_DIR = path.join(DOWNLOADS, 'ap-install');

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, dest, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    }).on('error', reject);
  });
}

function extractZip(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  // Linux's GNU tar can't extract zip; Windows ships no `unzip`. Pick per-OS.
  const cmd = IS_WIN
    ? { exe: 'tar', args: ['-xf', zip, '-C', dest] }
    : { exe: 'unzip', args: ['-o', zip, '-d', dest] };
  const r = spawnSync(cmd.exe, cmd.args, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) {
    throw new Error(`${cmd.exe} failed (status ${r.status}). Install ${cmd.exe} and retry.`);
  }
}

function findBinary(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name === BIN_NAME) return full;
    }
  }
  return null;
}

function updatePathUnix() {
  const shell = process.env.SHELL || '';
  const rc = shell.endsWith('/zsh') ? path.join(os.homedir(), '.zshrc') : path.join(os.homedir(), '.bashrc');
  let existing = '';
  try { existing = fs.readFileSync(rc, 'utf8'); } catch { /* missing file is fine */ }
  if (existing.includes(BIN_DIR)) return 'path-already-configured';
  const line = `\nexport PATH="${BIN_DIR}:$PATH"\n`;
  try {
    fs.appendFileSync(rc, line);
    return `path-added-to:${rc}`;
  } catch {
    return `path-update-failed:${rc}`;
  }
}

function updatePathWindows() {
  // Read the User-scope PATH and append BIN_DIR if missing. Using PowerShell
  // (not `setx`) avoids the 1024-char truncation `setx` does.
  const ps = (script) => spawnSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8' });

  const getR = ps(`[Environment]::GetEnvironmentVariable('Path','User')`);
  if (getR.status !== 0) return 'path-update-failed:User-Env';
  const current = (getR.stdout || '').trim();
  if (current.split(';').some(p => p.toLowerCase() === BIN_DIR.toLowerCase())) {
    return 'path-already-configured';
  }
  const sep = current && !current.endsWith(';') ? ';' : '';
  const next = current + sep + BIN_DIR;
  const setR = ps(`[Environment]::SetEnvironmentVariable('Path', ${JSON.stringify(next)}, 'User')`);
  return setR.status === 0 ? 'path-added-to:User-Env' : 'path-update-failed:User-Env';
}

async function main() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.mkdirSync(DOWNLOADS, { recursive: true });

  await download(ZIP_URL, ZIP_PATH);
  fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
  extractZip(ZIP_PATH, EXTRACT_DIR);

  const src = findBinary(EXTRACT_DIR);
  if (!src) throw new Error(`'${BIN_NAME}' not found in ${EXTRACT_DIR}`);

  const dest = path.join(BIN_DIR, BIN_NAME);
  fs.copyFileSync(src, dest);
  if (!IS_WIN) fs.chmodSync(dest, 0o755);

  fs.rmSync(ZIP_PATH, { force: true });
  fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });

  const pathStatus = IS_WIN ? updatePathWindows() : updatePathUnix();
  console.log(`ap installed at ${dest} (${pathStatus})`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});

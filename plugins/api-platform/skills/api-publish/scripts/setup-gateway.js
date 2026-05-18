#!/usr/bin/env node
// Set up the WSO2 API Platform Gateway under ~/wso2-api-gateway/v<version>/
// and bring up its Docker Compose stack on Linux, macOS, or Windows.
// Idempotent: if the versioned directory already exists, it's reused.
//
// Env overrides:
//   GW_VERSION    gateway release version, default "1.1.0"
//   GW_PARENT     parent directory, default "$HOME/wso2-api-gateway"
//   COMPOSE_PROJ  compose project name, default "gateway"

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const IS_WIN = process.platform === 'win32';
const GW_VERSION = process.env.GW_VERSION || '1.1.0';
const GW_PARENT = process.env.GW_PARENT || path.join(os.homedir(), 'wso2-api-gateway');
const GW_DIR = path.join(GW_PARENT, `v${GW_VERSION}`);
const COMPOSE_PROJ = process.env.COMPOSE_PROJ || 'gateway';

function pickCompose() {
  // Prefer the modern `docker compose` plugin; fall back to legacy docker-compose.
  for (const candidate of [['docker', 'compose'], ['docker-compose']]) {
    const r = spawnSync(candidate[0], [...candidate.slice(1), 'version'],
      { stdio: 'ignore', shell: IS_WIN });
    if (r.status === 0) return candidate;
  }
  return null;
}

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
  const cmd = IS_WIN
    ? { exe: 'tar', args: ['-xf', zip, '-C', dest] }
    : { exe: 'unzip', args: ['-q', zip, '-d', dest] };
  const r = spawnSync(cmd.exe, cmd.args, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error(`${cmd.exe} failed (status ${r.status}). Install ${cmd.exe} and retry.`);
}

async function main() {
  const compose = pickCompose();
  if (!compose) {
    console.error("ERROR: Docker Compose not found. Install Docker Desktop / Rancher Desktop / Colima, or 'docker engine + compose plugin'.");
    process.exit(1);
  }

  let status = 'reused-existing';
  if (!fs.existsSync(GW_DIR)) {
    status = 'freshly-extracted';
    fs.mkdirSync(GW_PARENT, { recursive: true });
    const downloads = path.join(os.homedir(), 'Downloads');
    fs.mkdirSync(downloads, { recursive: true });

    const zipName = `wso2apip-api-gateway-${GW_VERSION}.zip`;
    const zipUrl = `https://github.com/wso2/api-platform/releases/download/gateway/v${GW_VERSION}/${zipName}`;
    const zipPath = path.join(downloads, zipName);

    await download(zipUrl, zipPath);
    extractZip(zipPath, GW_PARENT);
    fs.rmSync(zipPath, { force: true });

    const extracted = path.join(GW_PARENT, `wso2apip-api-gateway-${GW_VERSION}`);
    fs.renameSync(extracted, GW_DIR);
  }

  const composeArgs = [...compose.slice(1), '-p', COMPOSE_PROJ, 'up', '-d'];
  const r = spawnSync(compose[0], composeArgs, { cwd: GW_DIR, stdio: 'inherit', shell: IS_WIN });
  if (r.status !== 0) {
    console.error(`ERROR: '${compose.join(' ')} up -d' failed in ${GW_DIR}`);
    process.exit(r.status || 1);
  }

  console.log(`gateway ready at ${GW_DIR} (${status}); compose project: ${COMPOSE_PROJ}; compose: ${compose.join(' ')}`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});

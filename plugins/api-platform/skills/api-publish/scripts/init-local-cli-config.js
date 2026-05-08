#!/usr/bin/env node
// Initialize the `ap` CLI config (~/.wso2ap/config.yaml) for the local
// Docker gateway. Used by the api-publish skill in the fresh-local
// branch of Phase 1, Step 4 — replaces an interactive `ap gateway add`
// run so the agent never has to handle credentials in chat.
//
// The username/password written here are the WSO2 gateway's documented
// public defaults, shipped in `configs/config.toml` of the gateway
// release zip:
//
//   [[controller.auth.basic.users]]
//   username = "admin"
//   password = "admin"
//   roles    = ["admin"]
//
// They are fixture values, not user-supplied secrets — the same values
// printed in WSO2's own quick-start docs and curl examples. Anyone
// running a fresh local gateway already has these credentials
// regardless of what this script does.
//
// Idempotent:
//   - config file missing or effectively empty (zero bytes, whitespace
//     only, or `{}` — what the `ap` CLI sometimes leaves behind) → write
//     fresh, exit "created"
//   - config file has dev entry → no-op, exit "local-already-registered"
//   - config file has other entries but no dev → exit non-zero with an
//     instruction for the user to run `ap gateway add` themselves; we
//     do not text-merge a YAML file we did not write.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CONFIG_DIR = path.join(os.homedir(), '.wso2ap');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');

const FRESH_CONFIG = `gateways:
  - name: dev
    server: http://localhost:9090
    adminServer: http://localhost:9094
    auth: basic
    username: admin
    password: admin
activeGateway: dev
`;

const HAS_DEV_ENTRY = /^\s*-\s+name:\s+dev\s*$/m;

// "Effectively empty" — file the `ap` CLI may leave behind when no
// gateway is registered yet. Treat the same as "file missing" so we can
// safely overwrite. Anything else (real entries, comments) we don't touch.
function isEffectivelyEmpty(text) {
  const stripped = text.replace(/#.*$/gm, '').trim();
  return stripped === '' || stripped === '{}';
}

function main() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, FRESH_CONFIG, { mode: 0o600 });
    console.log(`cli config initialized at ${CONFIG_PATH} (created)`);
    return 0;
  }

  const existing = fs.readFileSync(CONFIG_PATH, 'utf8');

  if (isEffectivelyEmpty(existing)) {
    fs.writeFileSync(CONFIG_PATH, FRESH_CONFIG, { mode: 0o600 });
    console.log(`cli config initialized at ${CONFIG_PATH} (created)`);
    return 0;
  }

  if (HAS_DEV_ENTRY.test(existing)) {
    console.log(`cli config initialized at ${CONFIG_PATH} (local-already-registered)`);
    return 0;
  }

  console.error(
    `${CONFIG_PATH} already exists with other gateway entries.\n` +
    `Refusing to text-merge a config file written by another flow. Please run:\n\n` +
    `  ap gateway add --display-name dev --server http://localhost:9090 --admin-server http://localhost:9094 --auth basic\n\n` +
    `yourself in your terminal — the CLI will prompt for credentials.\n` +
    `Local-gateway defaults are admin / admin.`
  );
  return 1;
}

process.exit(main());

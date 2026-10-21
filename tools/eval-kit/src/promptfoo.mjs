import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PROMPTFOO_DIR, SUITE_DIR } from './suite.mjs';

const PASS_THROUGH = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM', 'CLAUDE_CONFIG_DIR', 'NODE_EXTRA_CA_CERTS', 'EVAL_BUDGET_USD'];

export function promptfooEnv(extra = {}) {
  const env = Object.fromEntries(PASS_THROUGH.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
  return {
    ...env,
    PROMPTFOO_CONFIG_DIR: PROMPTFOO_DIR,
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_UPDATE: '1',
    PROMPTFOO_DISABLE_SHARING: '1',
    PROMPTFOO_DISABLE_SHARE_EMAIL_REQUEST: '1',
    PROMPTFOO_DISABLE_REMOTE_GENERATION: '1',
    PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: '1',
    PROMPTFOO_DISABLE_DEBUG_LOG: '1',
    PROMPTFOO_DISABLE_ERROR_LOG: '1',
    PROMPTFOO_CACHE_ENABLED: 'false',
    ...extra,
  };
}

export function promptfoo(args, { env = promptfooEnv(), capture = false } = {}) {
  process.umask(0o077);
  fs.mkdirSync(PROMPTFOO_DIR, { recursive: true, mode: 0o700 });
  const bin = path.join(SUITE_DIR, 'node_modules', 'promptfoo', 'dist', 'src', 'entrypoint.js');
  const child = spawn(process.execPath, ['--import', new URL('./loopback.mjs', import.meta.url).href, bin, ...args],
    { cwd: SUITE_DIR, env, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  let out = '';
  child.stdout?.on('data', (d) => (out += d));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

export async function latestEvalId() {
  const { out } = await promptfoo(['list', 'evals', '--ids-only', '-n', '1'], { capture: true });
  return out.match(/eval-[\w:.-]+/)?.[0] ?? null;
}

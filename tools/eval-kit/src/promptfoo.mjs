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

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONDITION, SUITE_DIR, suitePaths } from './suite.mjs';

const PASS_THROUGH = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM', 'CLAUDE_CONFIG_DIR', 'NODE_EXTRA_CA_CERTS', 'EVAL_BUDGET_USD'];

export function promptfooEnv(extra = {}, { dir = SUITE_DIR, source = process.env } = {}) {
  const env = Object.fromEntries(PASS_THROUGH.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));
  return {
    ...env,
    ...extra,
    PROMPTFOO_CONFIG_DIR: suitePaths(dir).promptfoo,
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_UPDATE: '1',
    PROMPTFOO_DISABLE_SHARING: '1',
    PROMPTFOO_DISABLE_SHARE_EMAIL_REQUEST: '1',
    PROMPTFOO_DISABLE_REMOTE_GENERATION: '1',
    PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: '1',
    PROMPTFOO_DISABLE_DEBUG_LOG: '1',
    PROMPTFOO_DISABLE_ERROR_LOG: '1',
    PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: '1',
    PROMPTFOO_CACHE_ENABLED: 'false',
    DOTENV_PATH: os.devNull,
  };
}

export function nodeArgs(conditions = []) {
  for (const c of conditions) {
    if (typeof c !== 'string' || !CONDITION.test(c)) throw new Error(`condition ${JSON.stringify(c)} must match ${CONDITION}`);
  }
  return [...conditions.map((c) => `--conditions=${c}`), '--import', new URL('./loopback.mjs', import.meta.url).href];
}

export function promptfoo(args, { dir = SUITE_DIR, env = promptfooEnv({}, { dir }), capture = false, conditions = [] } = {}) {
  process.umask(0o077);
  fs.mkdirSync(suitePaths(dir).promptfoo, { recursive: true, mode: 0o700 });
  const bin = path.join(dir, 'node_modules', 'promptfoo', 'dist', 'src', 'entrypoint.js');
  const child = spawn(process.execPath, [...nodeArgs(conditions), bin, ...args], { cwd: dir, env, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  let out = '';
  child.stdout?.on('data', (d) => (out += d));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code: code ?? 1, signal, out }));
  });
}

export async function latestEvalId(opts = {}) {
  const { out } = await promptfoo(['list', 'evals', '--ids-only', '-n', '1'], { ...opts, capture: true });
  return out.match(/eval-[\w:.-]+/)?.[0] ?? null;
}

export async function exportEval(id, file, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const { code } = await promptfoo(['export', 'eval', id, '-o', file], { ...opts, capture: true });
  if (code !== 0 || !fs.existsSync(file)) throw new Error(`cannot export ${id}`);
}

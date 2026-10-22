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

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { statePath } from '../src/login.mjs';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const TOKEN = 'fixture-token';

const judged = (description, say, expect) => `
  - description: ${description}
    vars: { say: '${say}' }
    assert:
      - type: javascript
        value: file://node_modules/@wso2/eval-kit/lib/judge.js:verdict
        config: { rubric: 'EXPECT_${expect}', evidence: truth, subject: a test assistant, timeoutS: 10 }`;

const FILES = {
  'promptfooconfig.yaml': `description: e2e
prompts: ['{{ say }}']
providers:
  - id: file://node_modules/@wso2/eval-kit/lib/capped.js
    label: agent
    config: { target: file://fake-agent.mjs, model: fake-model }
defaultTest:
  options:
    provider:
      id: file://node_modules/@wso2/eval-kit/lib/capped.js
      label: judge
      config: { target: file://fake-judge.mjs, judge: true, model: fake-judge-model }
tests:${judged('pass-case', 'list agents', 'PASS')}${judged('unknown-case', 'count agents', 'UNKNOWN')}${judged('rate-case', 'rate limited', 'PASS')}
`,
  'fake-agent.mjs': `import fs from 'node:fs';
import path from 'node:path';
export default class FakeAgent {
  id() { return 'fake-agent'; }
  async callApi(prompt) {
    const dir = process.env.EVAL_KIT_RUN_DIR;
    fs.appendFileSync(path.join(dir, 'calls.log'), JSON.stringify({
      prompt, runDir: dir, parentPid: process.ppid, dotenv: process.env.EVAL_DOTENV_LEAK ?? null, apiKey: process.env.ANTHROPIC_API_KEY ?? null,
      mode: process.env.EVAL_MODE ?? null, url: process.env.FIX_MCP_URL ?? null, hasToken: Boolean(process.env.FIX_MCP_TOKEN),
    }) + '\\n');
    if (prompt.includes('rate')) return { error: 'HTTP 429 Too Many Requests: rate limit, too_many_turns' };
    if (process.env.EVAL_MUTATE && !fs.existsSync(path.join(dir, 'mutated'))) {
      fs.writeFileSync(path.join(dir, 'mutated'), '');
      await fetch(process.env.FIX_MCP_URL.replace(/mcp$/, 'mutate'), { method: 'POST' });
    }
    return {
      output: 'reply to ' + prompt, cost: 0.01,
      tokenUsage: { prompt: 1000, completion: 10, total: 1010, completionDetails: { cacheReadInputTokens: 800 } },
      metadata: { numTurns: 2, truth: '{"agents":[]}', toolCalls: [{ name: 'mcp__fix__list_agents', input: {}, output: '[]', is_error: false }] },
    };
  }
}
`,
  'fake-judge.mjs': `export default class FakeJudge {
  id() { return 'fake-judge'; }
  async callApi(prompt, context) {
    if (!context?.prompt?.config?.output_format) return { error: 'no output_format' };
    const verdict = /EXPECT_(PASS|FAIL|UNKNOWN)/.exec(prompt)?.[1];
    return { output: { verdict, reason: 'fake ' + verdict }, cost: 0.001 };
  }
}
`,
};

function findPromptfoo() {
  const candidates = [process.env.EVAL_KIT_PROMPTFOO];
  try {
    candidates.push(path.resolve(path.dirname(createRequire(path.join(KIT, 'package.json')).resolve('promptfoo')), '..', '..'));
  } catch {}
  return candidates.find((d) => d && JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8') || '{}').name === 'promptfoo');
}

const PROMPTFOO = (() => {
  try {
    return findPromptfoo();
  } catch {
    return undefined;
  }
})();
const skip = PROMPTFOO ? false : 'promptfoo not found: set EVAL_KIT_PROMPTFOO to a promptfoo 0.124.1 package directory';

let mcp;
let mcpUrl;
let toolsVersion = 1;
let root;
let suite;
let legacy;
let kit;

const tools = () => [{ name: 'list_agents', description: `Lists agents (v${toolsVersion}).`, inputSchema: { type: 'object' } }];

const LEGACY_FILES = {
  'promptfooconfig.yaml': `description: legacy
prompts: ['{{prompt}}']
providers:
  - id: file://node_modules/@wso2/eval-kit/lib/capped.js
    label: agent
    config: { target: file://fake-agent.mjs, model: fake-model }
defaultTest:
  options:
    provider:
      id: file://node_modules/@wso2/eval-kit/lib/capped.js
      label: judge
      config: { target: file://fake-judge.mjs, judge: true, model: fake-judge-model }
tests:
  - description: list-agents
    vars: { prompt: 'List my agents.' }
    assert:
      - type: javascript
        value: file://node_modules/@wso2/eval-kit/lib/asserts.js:calledAnyOf
        config: { tools: [list_agents] }
      - type: llm-rubric
        transform: file://node_modules/@wso2/eval-kit/lib/asserts.js:replyWithToolResults
        value: Says there are no agents.
`,
  'fake-agent.mjs': FILES['fake-agent.mjs'],
  'fake-judge.mjs': `export default class FakeJudge {
  id() { return 'fake-judge'; }
  async callApi(prompt) {
    return { output: JSON.stringify({ pass: prompt.includes('list_agents'), score: 1, reason: 'fake rubric' }), cost: 0.001 };
  }
}
`,
};

function makeSuite(name, files, suiteJson) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), text);
  const kitDir = path.join(dir, 'node_modules', '@wso2', 'eval-kit');
  for (const p of ['bin', 'src', 'lib', 'package.json']) fs.cpSync(path.join(KIT, p), path.join(kitDir, p), { recursive: true });
  fs.symlinkSync(PROMPTFOO, path.join(dir, 'node_modules', 'promptfoo'), 'dir');
  fs.writeFileSync(path.join(dir, '.env'), 'EVAL_DOTENV_LEAK=leaked\n');
  fs.writeFileSync(path.join(dir, 'suite.json'), JSON.stringify(suiteJson));
  const stateDir = path.join(dir, '.state');
  fs.mkdirSync(stateDir, { mode: 0o700 });
  fs.writeFileSync(statePath(mcpUrl, 'fix-client', stateDir), JSON.stringify({
    url: mcpUrl, client_id: 'fix-client', resource: mcpUrl, access_token: TOKEN, refresh_token: null, expires_at: Math.floor(Date.now() / 1000) + 7200,
  }), { mode: 0o600 });
  return dir;
}

const kitIn = (dir) => (...args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(dir, 'node_modules', '@wso2', 'eval-kit', 'bin', 'eval-kit.mjs'), ...args], {
    cwd: dir, env: { PATH: process.env.PATH, HOME: path.join(root, 'home'), ANTHROPIC_API_KEY: 'sk-ant-e2e-not-a-key', NODE_OPTIONS: '' },
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  child.on('close', (code) => resolve({ code, out, err }));
});

before(async () => {
  if (skip) return;
  mcp = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    if (req.url === '/mutate') {
      toolsVersion += 1;
      return res.writeHead(204).end();
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401).end();
    const msg = JSON.parse(body);
    if (msg.id === undefined) return res.writeHead(202).end();
    const result = msg.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
      : msg.method === 'tools/list' ? { tools: tools() } : null;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
  });
  await new Promise((r) => mcp.listen(0, '127.0.0.1', r));
  mcpUrl = `http://127.0.0.1:${mcp.address().port}/mcp`;
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eval-kit-e2e-')));
  fs.mkdirSync(path.join(root, 'home'));
  const server = { name: 'fix', env: 'FIX_MCP', clientId: 'fix-client', callbackPort: 1, url: mcpUrl };
  suite = makeSuite('suite', FILES, { servers: [server], pass: '2of3', budgetUsd: 5, flags: { mutate: { env: 'EVAL_MUTATE' }, mode: { env: 'EVAL_MODE', value: 'fast' } } });
  legacy = makeSuite('legacy', LEGACY_FILES, { server: 'fix', env: 'FIX_MCP', clientId: 'fix-client', callbackPort: 1, url: mcpUrl });
  kit = kitIn(suite);
});

after(() => {
  mcp?.close();
  if (root && !process.env.EVAL_KIT_KEEP) fs.rmSync(root, { recursive: true, force: true });
});

const runs = () => fs.readdirSync(path.join(suite, 'results')).filter((d) => d.startsWith('eval-'));
const readRun = (id) => ({
  meta: JSON.parse(fs.readFileSync(path.join(suite, 'results', id, 'meta.json'), 'utf8')),
  calls: fs.readFileSync(path.join(suite, 'results', id, 'calls.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)),
});
const newRun = (beforeIds) => runs().find((id) => !beforeIds.includes(id));
const PAIR = ['--filter-pattern', 'pass-case|unknown-case', '-j', '1'];

test('e2e: promptfoo runs the kit end to end', { skip, timeout: 300_000 }, async (t) => {
  let base;
  await t.test('a run records labels, flags and verdicts, with no .env and no API key', async () => {
    const r = await kit('eval', '--label', 'base', '--note', 'first', '--mode', ...PAIR);
    assert.equal(r.code, 1, r.out + r.err);
    base = runs()[0];
    const { meta, calls } = readRun(base);
    assert.equal(meta.label, 'base');
    assert.equal(meta.note, 'first');
    assert.deepEqual(meta.suiteFlags, { mode: 'fast' });
    assert.deepEqual(meta.flags, { partial: false, tainted: false, errored: false });
    assert.equal(meta.servers.fix.url, mcpUrl);
    assert.equal(meta.servers.fix.tools.before, meta.servers.fix.tools.after);
    assert.equal(meta.budget.limit, 5);
    assert.equal(meta.budget.spent.toFixed(3), '0.066');
    assert.equal(calls.length, 6);
    for (const c of calls) {
      assert.deepEqual([c.dotenv, c.apiKey, c.mode, c.url, c.hasToken], [null, null, 'fast', mcpUrl, true]);
      assert.equal(c.runDir, path.join(suite, 'results', `.run-${c.parentPid}`));
    }
    assert.ok(!fs.readFileSync(path.join(suite, 'results', base, 'eval.json'), 'utf8').includes(TOKEN));
    assert.ok(!JSON.stringify(meta).includes(TOKEN));
    assert.match(r.out, /unknown-case: 0\/3 3\? FAIL/);
    assert.match(r.out, /pass-case: 3\/3 PASS/);
    assert.equal((await kit('pin', 'base')).code, 0);
  });

  let second;
  await t.test('tools that change mid-run taint it; UNKNOWN reaches compare', async () => {
    const r = await kit('eval', '--label', 'second', '--mutate', ...PAIR);
    toolsVersion = 1;
    assert.equal(r.code, 4, r.out + r.err);
    second = newRun([base]);
    const { meta } = readRun(second);
    assert.equal(meta.flags.tainted, true);
    assert.deepEqual(meta.suiteFlags, { mutate: '1' });
    assert.notEqual(meta.servers.fix.tools.before, meta.servers.fix.tools.after);
    assert.ok(fs.existsSync(path.join(suite, 'results', second, 'tools', 'fix.after.json')));
    assert.match(r.out, /unknown-case: 0\/3 3\? -> 0\/3 3\? =/);
    assert.match(r.out, /warning: B .* is tainted/);

    const c = await kit('compare', '--json', 'base', 'second');
    assert.equal(c.code, 0, c.err);
    const cmp = JSON.parse(c.out);
    assert.equal(cmp.verdict, 'NO CHANGE');
    assert.equal(cmp.rows.find((x) => x.case === 'unknown-case').b.unknown, 3);
    assert.deepEqual(cmp.flags.b, { partial: false, tainted: true, errored: false });
    assert.equal(cmp.rows[0].a.cacheHitPct, 80);
  });

  await t.test('a run stopped by the budget is partial and exits 4', async () => {
    const seen = runs();
    const r = await kit('eval', '--budget', '0.015', '--no-compare', '--filter-pattern', 'pass-case', '-j', '1');
    assert.equal(r.code, 4, r.out + r.err);
    const { meta, calls } = readRun(newRun(seen));
    assert.equal(meta.flags.partial, true);
    assert.equal(meta.flags.errored, false);
    assert.equal(meta.budget.refused, 1);
    assert.equal(calls.length, 2);
    assert.match(r.out, /partial: eval-kit budget:/);
  });

  await t.test('a 429-shaped provider error is not retried', async () => {
    const seen = runs();
    const r = await kit('eval', '--no-compare', '--filter-pattern', 'rate-case', '-j', '1');
    assert.equal(r.code, 4, r.out + r.err);
    const { meta, calls } = readRun(newRun(seen));
    assert.equal(meta.flags.errored, true);
    assert.equal(calls.length, 3);
  });

  await t.test('--filter-failing takes a label', async () => {
    const seen = runs();
    const r = await kit('eval', '--no-compare', '--filter-failing', 'base', '-j', '1');
    assert.equal(r.code, 1, r.out + r.err);
    const { calls } = readRun(newRun(seen));
    assert.deepEqual([...new Set(calls.map((c) => c.prompt))], ['count agents']);
  });

  await t.test('list and show read the runs', async () => {
    const l = await kit('list');
    assert.equal(l.code, 0);
    assert.match(l.out, /\* eval-\S+ {2}base/);
    const s = await kit('show', 'second', 'unknown');
    assert.equal(s.code, 0);
    assert.match(s.out, /unknown-case #1: UNKNOWN/);
    assert.match(s.out, /tainted/);
  });
});

test('e2e: a legacy single-server product suite runs unchanged and compares with a v0.1.1 baseline', { skip, timeout: 120_000 }, async () => {
  const run = kitIn(legacy);
  const first = await run('eval');
  assert.equal(first.code, 0, first.out + first.err);
  assert.match(first.out, /list-agents: 3\/3 PASS/);
  const results = path.join(legacy, 'results');
  const [id] = fs.readdirSync(results).filter((d) => d.startsWith('eval-'));
  const meta = JSON.parse(fs.readFileSync(path.join(results, id, 'meta.json'), 'utf8'));
  assert.deepEqual(Object.keys(meta.servers), ['fix']);
  const calls = fs.readFileSync(path.join(results, id, 'calls.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(calls.every((c) => c.hasToken && c.url === mcpUrl && c.dotenv === null));

  const old = 'eval-v01-2020-01-01T00:00:00';
  fs.mkdirSync(path.join(results, old));
  const exp = JSON.parse(fs.readFileSync(path.join(results, id, 'eval.json'), 'utf8'));
  fs.writeFileSync(path.join(results, old, 'eval.json'), JSON.stringify({ ...exp, evalId: old }));
  fs.copyFileSync(path.join(results, id, 'tools', 'fix.json'), path.join(results, old, 'tools.json'));
  assert.equal((await run('pin', old)).code, 0);

  const second = await run('eval');
  assert.equal(second.code, 0, second.out + second.err);
  assert.match(second.out, /verdict: NO CHANGE/);
  const diff = await run('tools', '--diff');
  assert.equal(diff.code, 0, diff.err);
  assert.match(diff.out, new RegExp(`\\[fix\\] no tool changes since ${old}`));
});

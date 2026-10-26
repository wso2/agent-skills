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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { doctorMain } from '../src/doctor.mjs';
import { loginMain, statePath } from '../src/login.mjs';
import { runEval } from '../src/run.mjs';
import { toolsMain } from '../src/tools.mjs';

const TOKEN = 'fixture-token';
let mcp;
let mcpUrl;
let repo;

before(async () => {
  mcp = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401).end();
    const msg = JSON.parse(body);
    if (msg.id === undefined) return res.writeHead(202).end();
    const result = msg.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
      : { tools: [{ name: 'list_agents', inputSchema: { type: 'object' } }] };
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
  });
  await new Promise((r) => mcp.listen(0, '127.0.0.1', r));
  mcpUrl = `http://127.0.0.1:${mcp.address().port}/mcp`;
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eval-kit-state-')));
  execFileSync('git', ['init', '-q', repo]);
});

after(() => {
  mcp?.close();
  if (repo) fs.rmSync(repo, { recursive: true, force: true });
});

function makeSuite(name, suiteJson, { server = {}, cache = {} } = {}) {
  const dir = path.join(repo, name, 'evals', 'suite');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'promptfooconfig.yaml'), 'tests: []\n');
  fs.writeFileSync(path.join(dir, 'suite.json'), JSON.stringify({
    servers: [{ name: 'fix', clientId: 'fix-client', callbackPort: 1, url: mcpUrl, ...server }], ...suiteJson,
  }));
  const stateDir = path.join(repo, name, '.state');
  fs.mkdirSync(stateDir, { mode: 0o700 });
  fs.writeFileSync(statePath(mcpUrl, 'fix-client', stateDir), JSON.stringify({
    url: mcpUrl, client_id: 'fix-client', resource: mcpUrl, access_token: TOKEN, refresh_token: null, expires_at: Math.floor(Date.now() / 1000) + 7200, ...cache,
  }), { mode: 0o600 });
  return { dir, stateDir };
}

async function captured(fn) {
  const lines = [];
  const { log, error } = console;
  console.log = console.error = (m) => lines.push(String(m));
  try {
    return { code: await fn(), out: lines.join('\n') };
  } finally {
    Object.assign(console, { log, error });
  }
}

test('doctor and login use the stateDir from suite.json', async () => {
  const { dir, stateDir } = makeSuite('shared', { gitScope: '../..', stateDir: '../../.state' });
  fs.writeFileSync(path.join(repo, '.gitignore'), 'shared/.state/\nshared/evals/suite/.promptfoo/\nshared/evals/suite/results/\nsuite.local.json\n');

  const doctor = await captured(() => doctorMain([], { dir }));
  assert.match(doctor.out, /ok {4}git ignores \.\.\/\.\.\/\.state\/ \.promptfoo\/ results\/ suite\.local\.json/);
  assert.match(doctor.out, /ok {4}fix: signed in .* 1 tools at/);
  assert.ok(!fs.existsSync(path.join(dir, '.state')));

  const login = await captured(() => loginMain([], { dir }));
  assert.equal(login.code, 0, login.out);
  assert.match(login.out, /fix: signed in via cache/);
  const logout = await captured(() => loginMain(['--logout', '--all'], { dir }));
  assert.match(logout.out, /1 files removed/);
  assert.deepEqual(fs.readdirSync(stateDir), []);
});

test('doctor names the configured state folder when git does not ignore it', async () => {
  const { dir } = makeSuite('open', { gitScope: '../..', stateDir: '../../.state' });
  fs.writeFileSync(path.join(repo, '.gitignore'), 'open/evals/suite/.promptfoo/\nopen/evals/suite/results/\nsuite.local.json\n');
  const doctor = await captured(() => doctorMain([], { dir }));
  assert.match(doctor.out, /FAIL {2}not git-ignored: \.\.\/\.\.\/\.state\/$/m);
});

test('doctor, login, tools and eval check the authServer of each server, and suite.local.json overrides it', async () => {
  const { dir } = makeSuite('pinned', { gitScope: '../..', stateDir: '../../.state' }, { server: { authServer: 'https://other.example' }, cache: { auth_server: 'https://idp.example' } });
  assert.match((await captured(() => doctorMain([], { dir }))).out, /FAIL {2}fix: sign-in: fix: not signed in/);
  assert.equal((await captured(() => loginMain(['--no-browser'], { dir }))).code, 3);
  await assert.rejects(captured(() => toolsMain([], { dir })), /resource metadata/);
  const run = await captured(() => runEval([], { dir }));
  assert.equal(run.code, 3);
  assert.match(run.out, /^preflight: resource metadata/m);

  fs.writeFileSync(path.join(dir, 'suite.local.json'), JSON.stringify({ servers: [{ name: 'fix', authServer: 'https://idp.example/' }] }));
  assert.match((await captured(() => doctorMain([], { dir }))).out, /ok {4}fix: signed in .* 1 tools at/);
  assert.match((await captured(() => loginMain([], { dir }))).out, /fix: signed in via cache/);
  const tools = await captured(() => toolsMain([], { dir }));
  assert.equal(tools.code, 0, tools.out);
  assert.match(tools.out, /list_agents/);
});

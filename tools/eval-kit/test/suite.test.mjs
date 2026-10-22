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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadSuite, SuiteError } from '../src/suite.mjs';

function suite(json, local) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-test-'));
  if (json) fs.writeFileSync(path.join(dir, 'suite.json'), JSON.stringify(json));
  if (local) fs.writeFileSync(path.join(dir, 'suite.local.json'), JSON.stringify(local));
  return dir;
}

const legacy = { server: 'agent-manager', env: 'AMP_MCP', clientId: 'am-mcp', callbackPort: 33418, url: 'http://localhost:9000/mcp' };
const two = {
  servers: [
    { name: 'agent-platform', clientId: 'am-mcp', callbackPort: 33418, url: 'https://a.example/mcp' },
    { name: 'integration-platform', clientId: 'IPAAS_MCP', callbackPort: 33420, url: 'https://b.example/mcp' },
  ],
};

test('legacy top-level fields become servers[0]', () => {
  const s = loadSuite(suite(legacy), {});
  assert.deepEqual(s.servers, [{ name: 'agent-manager', env: 'AMP_MCP', clientId: 'am-mcp', callbackPort: 33418, url: 'http://localhost:9000/mcp', authFrom: 'http://localhost:9000/mcp', origin: 'suite.json' }]);
  assert.equal(s.pass, '2of3');
  assert.deepEqual(s.conditions, []);
  assert.deepEqual(s.flags, {});
  assert.equal(s.server, undefined);
});

test('no suite.json means no servers', () => {
  assert.deepEqual(loadSuite(suite(), { MCP_URL: 'https://x.example/mcp' }).servers, []);
});

test('servers[] is validated', () => {
  const bad = (servers, re) => assert.throws(() => loadSuite(suite({ servers }), {}), re);
  const ok = two.servers[0];
  bad([{ ...ok, name: 'Agent' }], /name must match/);
  bad([{ ...ok, env: 'amp' }], /env must match/);
  bad([{ ...ok, callbackPort: 70000 }], /callbackPort/);
  bad([{ ...ok, clientId: '' }], /clientId/);
  bad([{ ...ok, url: 'http://example.com/mcp' }], /use https/);
  bad([{ ...ok, authFrom: 'http://example.com/mcp' }], /authFrom: use https/);
  bad([ok, { ...ok, callbackPort: 1 }], /duplicate server name/);
  bad([ok, { ...ok, name: 'other' }], /duplicate server port/);
  assert.throws(() => loadSuite(suite({ ...legacy, servers: [ok] }), {}), SuiteError);
  assert.throws(() => loadSuite(suite({ ...two, conditions: ['--require x'] }), {}), /condition/);
  assert.throws(() => loadSuite(suite({ ...two, pass: 'most' }), {}), /pass must be/);
  assert.throws(() => loadSuite(suite({ ...two, budgetUsd: -1 }), {}), /budgetUsd/);
  assert.throws(() => loadSuite(suite({ ...two, flags: { overlay: { env: 'PATH' } } }), {}), /flag overlay/);
  assert.throws(() => loadSuite(suite({ ...two, flags: { overlay: { env: 'EVAL_KIT_RUN_DIR' } } }), {}), /flag overlay/);
  assert.throws(() => loadSuite(suite({ ...two, flags: { label: { env: 'EVAL_LABEL' } } }), {}), /kit flag/);
});

test('suite.local.json merges key by key and keeps unknown keys', () => {
  const dir = suite(
    { ...two, gateway: { url: 'http://localhost:8095' }, conditions: ['@wso2cloud/source'], pass: 'all', budgetUsd: 10, gitScope: '..', flags: { overlay: { env: 'EVAL_OVERLAY' } } },
    { servers: [{ name: 'integration-platform', url: 'http://localhost:9090/mcp' }], budgetUsd: 1, flags: { 'allow-writes': { env: 'EVAL_ALLOW_WRITES' } } },
  );
  const s = loadSuite(dir, {});
  assert.deepEqual(s.gateway, { url: 'http://localhost:8095' });
  assert.equal(s.budgetUsd, 1);
  assert.equal(s.pass, 'all');
  assert.equal(s.gitScope, '..');
  assert.deepEqual(s.conditions, ['@wso2cloud/source']);
  assert.deepEqual(Object.keys(s.flags), ['overlay', 'allow-writes']);
  assert.equal(s.servers[0].origin, 'suite.json');
  assert.deepEqual([s.servers[1].url, s.servers[1].clientId, s.servers[1].origin], ['http://localhost:9090/mcp', 'IPAAS_MCP', 'suite.local.json']);
  assert.equal(s.origins.budgetUsd, 'suite.local.json');
  assert.equal(s.origins.gateway, 'suite.json');
  assert.equal(s.dir, dir);
});

test('a legacy suite.local.json overrides the single server', () => {
  const s = loadSuite(suite(legacy, { url: 'http://localhost:9001/mcp' }), {});
  assert.equal(s.servers.length, 1);
  assert.equal(s.servers[0].url, 'http://localhost:9001/mcp');
  assert.equal(s.servers[0].origin, 'suite.local.json');
});

test('MCP_URL and MCP_AUTH_FROM apply only with a single server', () => {
  const s = loadSuite(suite(legacy), { MCP_URL: 'https://x.example/mcp', MCP_AUTH_FROM: 'https://auth.example/mcp' });
  assert.equal(s.servers[0].url, 'https://x.example/mcp');
  assert.equal(s.servers[0].authFrom, 'https://auth.example/mcp');
  assert.equal(s.servers[0].origin, 'MCP_URL');
  assert.throws(() => loadSuite(suite(two), { MCP_URL: 'https://x.example/mcp' }), /exactly one server/);
  assert.throws(() => loadSuite(suite(legacy), { MCP_URL: 'http://evil.example/mcp' }), /use https/);
});

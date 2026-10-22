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
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const script = `
import Capped from ${JSON.stringify(new URL('../lib/capped.js', import.meta.url).href)};
const inner = { calls: 0, async callApi() { this.calls += 1; return { output: 'ok', cost: 0.6 }; }, async cleanup() { console.log('cleanup'); } };
const agent = new Capped({ label: 'agent', config: { target: 'x' } });
const judge = new Capped({ label: 'judge', config: { target: 'x', judge: true } });
agent.loading = judge.loading = Promise.resolve(inner);
const out = [];
for (const p of [agent, agent, judge, agent, judge]) out.push((await p.callApi('hi')).error ?? 'ok');
console.log(JSON.stringify({ out, calls: inner.calls, retries: agent.handlesOwnRetries, id: agent.id() }));
await agent.cleanup();
`;

test('capped refuses new agent calls over budget, counts and never refuses judges, writes budget.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capped-test-'));
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { PATH: process.env.PATH, EVAL_BUDGET_USD: '1', EVAL_KIT_RUN_DIR: dir } });
  const [json, cleanup] = r.stdout.trim().split('\n');
  const res = JSON.parse(json);
  assert.deepEqual(res.out.map((o) => (o === 'ok' ? o : o.split(' ')[0] + ' ' + o.split(' ')[1])), ['ok', 'ok', 'ok', 'eval-kit budget:', 'ok']);
  assert.equal(res.calls, 4);
  assert.equal(res.retries, true);
  assert.equal(res.id, 'agent');
  assert.equal(cleanup, 'cleanup');
  const budget = JSON.parse(fs.readFileSync(path.join(dir, 'budget.json'), 'utf8'));
  assert.equal(budget.limit, 1);
  assert.equal(budget.refused, 1);
  assert.equal(budget.spent.toFixed(1), '2.4');
  assert.match(r.stderr, /eval-kit budget: spent \$2\.400 of \$1/);
});

test('an invalid EVAL_BUDGET_USD fails at load', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import Capped from ${JSON.stringify(new URL('../lib/capped.js', import.meta.url).href)}; new Capped({ config: { target: 'x' } });`],
    { encoding: 'utf8', env: { PATH: process.env.PATH, EVAL_BUDGET_USD: 'lots' } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /EVAL_BUDGET_USD must be a non-negative number/);
});

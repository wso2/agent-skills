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
import { test } from 'node:test';
import { MARKER } from '../lib/budget.js';
import { passesCase } from '../src/compare.mjs';
import { buildMeta, exitCode, flagEnv, flagsOf, parseRunArgs } from '../src/run.mjs';

const suiteFlags = { overlay: { env: 'EVAL_OVERLAY' }, 'allow-writes': { env: 'EVAL_ALLOW_WRITES', value: 'yes' } };

test('kit and suite flags are taken out of the promptfoo args', () => {
  const { kit, rest } = parseRunArgs(['--label', 'base', '--note=first try', '--budget', '0.5', '--no-compare', '--overlay', 'overlays/x', '--allow-writes', '-j', '2', '--filter-pattern', 'list', '--filter-failing', 'latest'], suiteFlags);
  assert.deepEqual(kit, { label: 'base', note: 'first try', budget: 0.5, compare: false, flags: { overlay: 'overlays/x', 'allow-writes': 'yes' }, filterFailing: 'latest' });
  assert.deepEqual(rest, ['-j', '2', '--filter-pattern', 'list']);
  assert.deepEqual(parseRunArgs(['--overlay'], suiteFlags).kit.flags, { overlay: '1' });
  assert.deepEqual(flagEnv(suiteFlags, { overlay: 'dir', 'allow-writes': 'yes' }), { EVAL_OVERLAY: 'dir', EVAL_ALLOW_WRITES: 'yes' });
  assert.throws(() => parseRunArgs(['--label', '1bad'], suiteFlags), /label 1bad/);
  assert.throws(() => parseRunArgs(['--label'], suiteFlags), /needs a value/);
  for (const word of ['baseline', 'latest', 'previous', 'Baseline']) assert.throws(() => parseRunArgs(['--label', word], suiteFlags), /is reserved/);
  assert.throws(() => parseRunArgs(['--label=eval-abc'], suiteFlags), /looks like an eval id/);
  assert.equal(parseRunArgs(['--label', 'upstream'], suiteFlags).kit.label, 'upstream');
  assert.throws(() => parseRunArgs(['--budget=-1'], suiteFlags), /non-negative/);
  assert.deepEqual(parseRunArgs(['--overlay', 'x'], {}).rest, ['--overlay', 'x']);
});

test('flagsOf: partial, tainted and errored', () => {
  const ok = { failureReason: 0 };
  const stop = { failureReason: 2, error: `${MARKER} $1 reached ($1.020 spent); call not started` };
  const err = { failureReason: 2, error: 'judge: timed out after 180 s' };
  const same = { s: { before: 'abc', after: 'abc' } };
  assert.deepEqual(flagsOf({ results: [ok], tools: same }), { partial: false, tainted: false, errored: false });
  assert.deepEqual(flagsOf({ results: [ok, stop], tools: same }), { partial: true, tainted: false, errored: false });
  assert.deepEqual(flagsOf({ results: [ok], budget: { refused: 1 }, tools: same }), { partial: true, tainted: false, errored: false });
  assert.deepEqual(flagsOf({ results: [ok, err], tools: { s: { before: 'abc', after: 'def' } } }), { partial: false, tainted: true, errored: true });
  assert.equal(flagsOf({ results: [], tools: { s: { before: 'abc', after: null } } }).tainted, true);
});

test('exit codes', () => {
  const none = { partial: false, tainted: false, errored: false };
  assert.equal(exitCode({ flags: none }), 0);
  assert.equal(exitCode({ flags: none, failing: 1 }), 1);
  assert.equal(exitCode({ flags: none, verdict: 'WORSE' }), 1);
  for (const f of ['partial', 'tainted', 'errored']) assert.equal(exitCode({ flags: { ...none, [f]: true }, failing: 2 }), 4);
});

test('passesCase follows the suite rule', () => {
  assert.equal(passesCase({ k: 2, n: 3, e: 0 }, '2of3'), true);
  assert.equal(passesCase({ k: 2, n: 3, e: 0 }, 'all'), false);
  assert.equal(passesCase({ k: 0, n: 0, e: 0 }, 'all'), false);
});

test('meta.json has the contract fields and never a token', () => {
  const token = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJ4In0', 'c2lnbmF0dXJl'].join('.');
  const servers = [{ name: 'agent-platform', url: 'https://a.example/mcp', authFrom: 'https://a.example/mcp', origin: 'suite.json', clientId: 'am-mcp', token, before: 'abc', after: 'abc', beforeTools: [] }];
  const meta = buildMeta({
    evalId: 'eval-x', kit: { label: 'base', note: 'n', flags: { overlay: 'dir' } }, suite: { pass: 'all' }, servers,
    flags: { partial: false, tainted: false, errored: false }, budget: { limit: 10, spent: 0.5, refused: 0 }, git: { head: 'h', dirty: false },
    startedAt: 's', endedAt: 'e', args: ['--var', `t=Bearer ${token}`], version: '0.2.0',
  });
  assert.deepEqual(Object.keys(meta), ['kit', 'evalId', 'label', 'note', 'startedAt', 'endedAt', 'servers', 'flags', 'budget', 'git', 'suiteFlags', 'pass', 'args']);
  assert.deepEqual(meta.servers, { 'agent-platform': { url: 'https://a.example/mcp', origin: 'suite.json', tools: { before: 'abc', after: 'abc' } } });
  assert.deepEqual(meta.suiteFlags, { overlay: 'dir' });
  assert.deepEqual(meta.budget, { limit: 10, spent: 0.5, refused: 0 });
  assert.ok(!JSON.stringify(meta).includes(token));
  assert.ok(!JSON.stringify(meta).includes('c2lnbmF0dXJl'));
});

test('-o, -c, --output and --config are refused', () => {
  for (const a of [['-o', 'x.json'], ['--output', 'x.json'], ['-c', 'other.yaml'], ['--config=other.yaml']]) assert.throws(() => parseRunArgs(a, {}), /set by eval-kit/);
});

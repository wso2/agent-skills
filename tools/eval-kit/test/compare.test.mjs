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
import { compare, compareRuns, formatCompare, passes, passesCase, resolveRef, summarize, toolPath } from '../src/compare.mjs';
import { pin } from '../src/results.mjs';

function exp(id, outcomes, { model = 'm', judge = 'j', prompt = 'List my agents.', cost = 0.05, turns = 2, tools = ['list_agents'], description = 'list-agents', tokens, cacheRead = 0 } = {}) {
  return {
    evalId: id,
    config: { prompts: ['{{prompt}}'], providers: [{ config: { model } }], defaultTest: { options: { provider: { config: { model: judge } } } } },
    results: { results: [...outcomes].map((o, i) => ({
      testIdx: i, promptIdx: 0, success: o === 'P', failureReason: o === 'P' ? 0 : o === 'E' ? 2 : 1,
      testCase: { description, vars: { prompt, sessionId: `s-${id}-${i}` }, assert: [{ type: 'javascript' }] },
      gradingResult: o === 'E' ? undefined : { componentResults: [{ pass: o === 'P', metadata: { verdict: { P: 'PASS', F: 'FAIL', U: 'UNKNOWN' }[o], judgeCostUsd: 0.01 } }] },
      response: o === 'E' ? undefined : {
        cost, metadata: { numTurns: turns, toolCalls: tools.map((t) => ({ name: `mcp__s__${t}` })) },
        ...(tokens && { tokenUsage: { prompt: tokens, completionDetails: { cacheReadInputTokens: cacheRead } } }),
      },
      cost,
    })) },
  };
}

const run = (a, b, opts) => compare(summarize(a), summarize(b), opts);
const line = (c) => formatCompare(c).split('\n').find((l) => l.startsWith('list-agents:'));

test('a move of one run in three is noise', () => {
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PPF')).verdict, 'NO CHANGE');
  assert.match(line(run(exp('a', 'PPP'), exp('b', 'PPF'))), /3\/3 -> 2\/3 ~/);
});

test('a move of two runs is WORSE or BETTER', () => {
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PFF')).verdict, 'WORSE');
  assert.equal(run(exp('a', 'FFF'), exp('b', 'PPF')).verdict, 'BETTER');
});

test('errors make it INCONCLUSIVE', () => {
  const r = run(exp('a', 'PPP'), exp('b', 'PPE'));
  assert.equal(r.verdict, 'INCONCLUSIVE');
  assert.match(line(r), /2\/2\+1e/);
});

test('errors count only over common cases', () => {
  const a = exp('a', 'PPP');
  a.results.results.push(...exp('a', 'EEE', { description: 'gone' }).results.results);
  const r = run(a, exp('b', 'PPP'));
  assert.equal(r.errors, 0);
  assert.equal(r.verdict, 'NO CHANGE');
  assert.deepEqual(r.notInBoth, ['gone']);
});

test('UNKNOWN counts in n but not k', () => {
  const c = summarize(exp('x', 'PPU')).cases.get('list-agents');
  assert.deepEqual([c.k, c.n, c.e, c.unknown], [2, 3, 0, 1]);
  const r = run(exp('a', 'PPP'), exp('b', 'UUU'));
  assert.equal(r.verdict, 'WORSE');
  assert.match(line(r), /3\/3 -> 0\/3 3\? DOWN/);
  assert.equal(r.rows[0].b.unknown, 3);
});

test('a changed model, judge, case or server URL is NOT COMPARABLE', () => {
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PPP', { model: 'm2' })).verdict, 'NOT COMPARABLE');
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PPP', { judge: 'j2' })).verdict, 'NOT COMPARABLE');
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PPP', { prompt: 'Show agents.' })).verdict, 'NOT COMPARABLE');
  const meta = (url) => ({ servers: { s: { url } } });
  const r = run(exp('a', 'PPP'), exp('b', 'PPP'), { metaA: meta('https://a.example/mcp'), metaB: meta('https://b.example/mcp') });
  assert.equal(r.verdict, 'NOT COMPARABLE');
  assert.deepEqual(r.reasons, ['s URL https://a.example/mcp -> https://b.example/mcp']);
});

test('a different number of runs is NOT COMPARABLE', () => {
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PPPFFF')).verdict, 'NOT COMPARABLE');
});

test('agent cost, turns and calls are flagged', () => {
  const r = run(exp('a', 'PPP'), exp('b', 'PPP', { cost: 0.13, turns: 4, tools: ['list_projects', 'list_agents'] }));
  assert.match(line(r), /turns 2->4 !/);
  assert.match(line(r), /agent \$\/run 0\.050->0\.130 !/);
  assert.match(line(r), /calls\/run list_agents 1\.0->1\.0 list_projects 0\.0->1\.0/);
  assert.match(line(r), /tools list_agents -> list_projects > list_agents/);
  assert.match(formatCompare(r), /0 up, 0 down, 0 within noise; errors 0; agent cost \+160%/);
});

test('a tool path collapses repeated calls', () => {
  assert.equal(toolPath(['list_projects', 'list_integrations', 'list_integrations', 'list_integrations', 'get_project', 'list_integrations']), 'list_projects > list_integrations x3 > get_project > list_integrations');
  assert.equal(toolPath([]), '(none)');
});

test('a prompt-cache shift shows (cache) instead of !', () => {
  const r = run(exp('a', 'PPP', { tokens: 1000, cacheRead: 900 }), exp('b', 'PPP', { tokens: 1000, cacheRead: 100, cost: 0.13 }));
  assert.equal(r.rows[0].cacheShift, true);
  assert.equal(r.rows[0].costFlag, false);
  assert.match(line(r), /cache 90%->10%/);
  assert.match(line(r), /0\.050->0\.130 \(cache\)/);
  assert.match(formatCompare(r), /prompt cache warmth differs/);
});

test('2 of 3 or all runs pass a case', () => {
  const c = (o) => summarize(exp('x', o)).cases.get('list-agents');
  assert.equal(passes(c('PPF')), true);
  assert.equal(passes(c('PPE')), true);
  assert.equal(passes(c('PPU')), true);
  assert.equal(passes(c('PUU')), false);
  assert.equal(passes(c('PEE')), false);
  assert.equal(passesCase(c('PPP'), 'all'), true);
  assert.equal(passesCase(c('PPU'), 'all'), false);
});

test('repeats of a case without a description stay one case', () => {
  const { cases } = summarize(exp('x', 'PPF', { description: undefined }));
  assert.equal(cases.size, 1);
});

test('each provider of a run is its own case', () => {
  const e = exp('x', 'PPPFFF');
  e.results.prompts = [{ provider: 'claude' }, { provider: 'codex' }];
  e.results.results.forEach((r, i) => (r.promptIdx = i < 3 ? 0 : 1));
  assert.deepEqual([...summarize(e).cases.keys()], ['[claude/0] list-agents', '[codex/1] list-agents']);
});

function results(runs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-test-'));
  for (const [id, { exp: e, meta, tools = {}, served = {}, legacyTools }] of Object.entries(runs)) {
    const d = path.join(dir, id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'eval.json'), JSON.stringify(e));
    if (meta) fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(meta));
    for (const [kind, files] of [['tools', tools], ['served', served]]) {
      for (const [s, list] of Object.entries(files)) {
        fs.mkdirSync(path.join(d, kind), { recursive: true });
        fs.writeFileSync(path.join(d, kind, `${s}.json`), JSON.stringify(list));
      }
    }
    if (legacyTools) fs.writeFileSync(path.join(d, 'tools.json'), JSON.stringify(legacyTools));
  }
  return dir;
}

const T = (desc) => [{ name: 'list_agents', description: desc }];
const at = (min) => `2026-10-21T10:${String(min).padStart(2, '0')}:00.000Z`;
const meta = (min, extra = {}) => ({ startedAt: at(min), servers: { s: { url: 'https://s.example/mcp' } }, flags: { partial: false, tainted: false, errored: false }, ...extra });

test('compareRuns: tools changed per server, overlay marked, tainted warned, labels as refs, JSON shape', () => {
  const dir = results({
    'eval-aaa-2026-10-21T10:00:00': { exp: exp('eval-aaa-2026-10-21T10:00:00', 'PPP'), meta: meta(0, { label: 'base' }), tools: { s: T('v1') } },
    'eval-bbb-2026-10-21T10:05:00': {
      exp: exp('eval-bbb-2026-10-21T10:05:00', 'PPU'), meta: meta(5, { label: 'overlay', flags: { partial: false, tainted: true, errored: false } }),
      tools: { s: T('v1') }, served: { s: T('v2') },
    },
  });
  assert.equal(resolveRef('base', { resultsDir: dir }), 'eval-aaa-2026-10-21T10:00:00');
  assert.equal(resolveRef('latest', { resultsDir: dir }), 'eval-bbb-2026-10-21T10:05:00');
  const c = compareRuns('base', 'overlay', { resultsDir: dir });
  assert.deepEqual(c.toolsChanged, { s: ['~ list_agents.description: "v1" -> "v2" (overlay)'] });
  assert.equal(c.flags.b.tainted, true);
  assert.match(c.warnings.join('\n'), /B eval-bbb.* is tainted/);
  const { agentCost, ...b } = JSON.parse(JSON.stringify(c)).rows[0].b;
  assert.deepEqual(b, { k: 2, n: 3, e: 0, unknown: 1, turns: 2, calls: { list_agents: 1 }, tools: ['list_agents'] });
  assert.equal(agentCost.toFixed(3), '0.050');
  assert.equal(c.verdict, 'NO CHANGE');
  assert.deepEqual(c.labels, { a: 'base', b: 'overlay' });
});

test('compareRuns: the default pair is the baseline, else the previous run', () => {
  const ids = ['eval-aaa-2026-10-21T10:00:00', 'eval-bbb-2026-10-21T10:05:00', 'eval-ccc-2026-10-21T10:09:00'];
  const dir = results(Object.fromEntries(ids.map((id, i) => [id, { exp: exp(id, 'PPP'), meta: meta(i * 4) }])));
  let c = compareRuns(undefined, undefined, { resultsDir: dir });
  assert.deepEqual([c.a, c.b], [ids[1], ids[2]]);
  pin(ids[0], dir);
  c = compareRuns(undefined, undefined, { resultsDir: dir });
  assert.deepEqual([c.a, c.b], [ids[0], ids[2]]);
  assert.throws(() => compareRuns('nope', undefined, { resultsDir: dir }), /no run nope/);
});

test('compareRuns: a v0.1.1 run without meta.json and with tools.json still compares', () => {
  const dir = results({
    'eval-old-2026-10-20T10:00:00': { exp: exp('eval-old-2026-10-20T10:00:00', 'PPP'), legacyTools: T('v1') },
    'eval-new-2026-10-21T10:00:00': { exp: exp('eval-new-2026-10-21T10:00:00', 'PPP'), meta: meta(0), tools: { s: T('v2') } },
  });
  const c = compareRuns('eval-old-2026-10-20T10:00:00', 'latest', { resultsDir: dir });
  assert.equal(c.verdict, 'NO CHANGE');
  assert.deepEqual(c.toolsChanged, { s: ['~ list_agents.description: "v1" -> "v2"'] });
});

test('compare --json prints the comparison object', async () => {
  const { compareMain } = await import('../src/compare.mjs');
  const suite = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-json-'));
  const ids = ['eval-aaa-2026-10-21T10:00:00', 'eval-bbb-2026-10-21T10:05:00'];
  fs.renameSync(results({ [ids[0]]: { exp: exp(ids[0], 'PPP'), meta: meta(0, { label: 'base' }) }, [ids[1]]: { exp: exp(ids[1], 'PFF'), meta: meta(5) } }), path.join(suite, 'results'));
  const out = [];
  const log = console.log;
  console.log = (s) => out.push(s);
  try {
    assert.equal(await compareMain(['--json', 'base', 'latest'], { dir: suite }), 1);
  } finally {
    console.log = log;
  }
  const c = JSON.parse(out.join('\n'));
  assert.equal(c.verdict, 'WORSE');
  assert.deepEqual([c.a, c.b], ids);
  assert.ok(Array.isArray(c.rows) && c.flags && c.toolsChanged && c.reasons);
});

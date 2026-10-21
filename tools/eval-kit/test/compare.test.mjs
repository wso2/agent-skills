import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, passes, summarize } from '../src/compare.mjs';

function exp(id, outcomes, { model = 'm', judge = 'j', prompt = 'List my agents.', cost = 0.05, turns = 2, tools = ['list_agents'], description = 'list-agents' } = {}) {
  return {
    evalId: id,
    config: { prompts: ['{{prompt}}'], providers: [{ config: { model } }], defaultTest: { options: { provider: { config: { model: judge } } } } },
    results: { results: [...outcomes].map((o, i) => ({
      testIdx: i, promptIdx: 0, success: o === 'P', failureReason: o === 'P' ? 0 : o === 'F' ? 1 : 2,
      testCase: { description, vars: { prompt, sessionId: `s-${id}-${i}` }, assert: [{ type: 'javascript' }] },
      response: o === 'E' ? undefined : { cost, metadata: { numTurns: turns, toolCalls: tools.map((t) => ({ name: `mcp__s__${t}` })) } },
      cost,
    })) },
  };
}

const run = (a, b) => compare(summarize(a), summarize(b));

test('a move of one run in three is noise', () => {
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PPF')).verdict, 'NO CHANGE');
  assert.match(run(exp('a', 'PPP'), exp('b', 'PPF')).lines[0], /3\/3 -> 2\/3 ~/);
});

test('a move of two runs is WORSE or BETTER', () => {
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PFF')).verdict, 'WORSE');
  assert.equal(run(exp('a', 'FFF'), exp('b', 'PPF')).verdict, 'BETTER');
});

test('errors make it INCONCLUSIVE', () => {
  const r = run(exp('a', 'PPP'), exp('b', 'PPE'));
  assert.equal(r.verdict, 'INCONCLUSIVE');
  assert.match(r.lines[0], /2\/2\+1e/);
});

test('a changed model, judge or case is NOT COMPARABLE', () => {
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PPP', { model: 'm2' })).verdict, 'NOT COMPARABLE');
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PPP', { judge: 'j2' })).verdict, 'NOT COMPARABLE');
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PPP', { prompt: 'Show agents.' })).verdict, 'NOT COMPARABLE');
});

test('agent cost and turns are flagged', () => {
  const [line] = run(exp('a', 'PPP'), exp('b', 'PPP', { cost: 0.13, turns: 4, tools: ['list_projects', 'list_agents'] })).lines;
  assert.match(line, /turns 2->4 !/);
  assert.match(line, /agent \$\/run 0\.050->0\.130 !/);
  assert.match(line, /tools list_agents -> list_projects > list_agents/);
});

test('2 of 3 runs pass a case', () => {
  const c = (o) => summarize(exp('x', o)).cases.get('list-agents');
  assert.equal(passes(c('PPF')), true);
  assert.equal(passes(c('PPE')), true);
  assert.equal(passes(c('PFF')), false);
  assert.equal(passes(c('PEE')), false);
});

test('repeats of a case without a description stay one case', () => {
  const { cases } = summarize(exp('x', 'PPF', { description: undefined }));
  assert.equal(cases.size, 1);
  assert.equal(passes([...cases.values()][0]), true);
});

test('a different number of runs is NOT COMPARABLE', () => {
  assert.equal(run(exp('a', 'PPP'), exp('b', 'PPPFFF')).verdict, 'NOT COMPARABLE');
});

test('each provider of a run is its own case', () => {
  const e = exp('x', 'PPPFFF');
  e.results.prompts = [{ provider: 'claude' }, { provider: 'codex' }];
  e.results.results.forEach((r, i) => (r.promptIdx = i < 3 ? 0 : 1));
  assert.deepEqual([...summarize(e).cases.keys()], ['[claude/0] list-agents', '[codex/1] list-agents']);
});

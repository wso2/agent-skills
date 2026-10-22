import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVIDENCE_MAX_CHARS, judgePrompt, verdict, VERDICT_SCHEMA } from '../lib/judge.js';

function judge(reply, { delayMs = 0, cost = 0.02 } = {}) {
  const calls = [];
  return {
    calls,
    config: { model: 'claude-opus-5-5' },
    id: () => 'judge',
    async callApi(prompt, context, options) {
      calls.push({ prompt, context, options });
      if (delayMs) await new Promise((r, j) => {
        const t = setTimeout(r, delayMs);
        options?.abortSignal?.addEventListener('abort', () => (clearTimeout(t), j(new Error('aborted'))));
      });
      return typeof reply === 'function' ? reply() : { output: reply, cost };
    },
  };
}

const ctx = (provider, config = {}, metadata = { truth: '{"agents":[]}' }) => ({
  test: { options: { provider } }, metadata, config: { rubric: 'Says there are no agents.', evidence: 'truth', subject: 'a cloud console assistant', ...config },
});

test('PASS, FAIL and UNKNOWN verdicts with cost and model in metadata', async () => {
  for (const [v, pass] of [['PASS', true], ['FAIL', false], ['UNKNOWN', false]]) {
    const p = judge({ verdict: v, reason: 'because' });
    const r = await verdict('There are no agents.', ctx(p));
    assert.equal(r.pass, pass);
    assert.equal(r.score, pass ? 1 : 0);
    assert.equal(r.reason, `${v}: because`);
    assert.deepEqual(r.metadata, { verdict: v, judgeCostUsd: 0.02, judgeModel: 'claude-opus-5-5' });
  }
});

test('the judge gets the verdict schema, the rubric, the evidence and the reply', async () => {
  const p = judge(JSON.stringify({ verdict: 'PASS', reason: 'ok' }));
  await verdict('There are no agents.', ctx(p));
  const [{ prompt, context, options }] = p.calls;
  assert.deepEqual(context.prompt.config.output_format, { type: 'json_schema', schema: VERDICT_SCHEMA });
  assert.ok(options.abortSignal instanceof AbortSignal);
  assert.equal(prompt, judgePrompt({ rubric: 'Says there are no agents.', evidence: '{"agents":[]}', reply: 'There are no agents.', subject: 'a cloud console assistant', kind: 'truth' }));
  assert.match(prompt, /^You grade one reply of a cloud console assistant\. Use only the material below; you have no tools\.\nTRUTH holds what the platform APIs returned when the reply was graded\./);
});

test('tool results are the default evidence', async () => {
  const p = judge({ verdict: 'PASS', reason: 'ok' });
  const metadata = { toolCalls: [{ name: 'mcp__s__list_agents', input: {}, is_error: false, output: '[]' }, { name: 'Bash', input: {} }] };
  await verdict('none', { test: { options: { provider: p } }, metadata, config: { rubric: 'r' } });
  assert.match(p.calls[0].prompt, /<truth>\n\[\{"tool":"list_agents","input":\{\},"isError":false,"output":"\[\]"\}\]\n<\/truth>/);
  assert.match(p.calls[0].prompt, /^You grade one reply of an assistant\./);
});

test('a provider error, a timeout, no verdict, no truth or oversized evidence throws', async () => {
  await assert.rejects(verdict('x', ctx(judge(() => ({ error: '429 too many requests' })))), /judge: 429/);
  await assert.rejects(verdict('x', ctx(judge({ verdict: 'PASS' }, { delayMs: 5000 }), { timeoutS: 0.05 })), /timed out after 0.05 s/);
  await assert.rejects(verdict('x', ctx(judge({ verdict: 'MAYBE', reason: '' }))), /no verdict/);
  await assert.rejects(verdict('x', ctx(judge('not json'))), /no verdict/);
  await assert.rejects(verdict('x', ctx(judge({ verdict: 'PASS' }), {}, {})), /metadata\.truth/);
  await assert.rejects(verdict('x', ctx(judge({ verdict: 'PASS' }), {}, { truth: 'x'.repeat(EVIDENCE_MAX_CHARS + 1) })), /too large/);
  await assert.rejects(verdict('x', ctx(judge({ verdict: 'PASS' }), { rubric: '' })), /rubric is required/);
  await assert.rejects(verdict('x', { metadata: { truth: 't' }, config: { rubric: 'r', evidence: 'truth' } }), /defaultTest\.options\.provider/);
});

test('a provider error is redacted', async () => {
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ4In0', 'c2lnbmF0dXJl'].join('.');
  await assert.rejects(verdict('x', ctx(judge(() => ({ error: `rejected ${jwt}` })))), (e) => !e.message.includes('c2lnbmF0dXJl'));
});

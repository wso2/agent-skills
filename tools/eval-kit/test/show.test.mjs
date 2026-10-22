import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redact } from '../src/redact.mjs';
import { formatRun } from '../src/show.mjs';

const jwt = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJhbGljZSJ9', 'c2lnbmF0dXJlLXZhbHVl'].join('.');
const fake = ['abcd', 'efgh', '12345'].join('');
const field = (name) => `${name}_token`;

test('redact masks JWTs, bearer tokens and token fields', () => {
  assert.equal(redact(`token ${jwt} end`), 'token [REDACTED-JWT] end');
  assert.equal(redact(`Authorization: Bearer ${fake}`), 'Authorization: Bearer [REDACTED]');
  assert.equal(redact(`{"${field('access')}":"${fake}","${field('refresh')}": "${fake}"}`), `{"${field('access')}":"[REDACTED]","${field('refresh')}": "[REDACTED]"}`);
});

test('show output is redacted', () => {
  const exp = { results: { results: [{
    testIdx: 0, success: false, failureReason: 1, testCase: { description: 'leak' },
    response: { output: `here is ${jwt}`, cost: 0.01, metadata: { numTurns: 1, toolCalls: [{ name: 'mcp__s__get_token' }] } },
    gradingResult: { componentResults: [{ assertion: { type: 'javascript' }, reason: `FAIL: saw Bearer ${fake}`, metadata: { verdict: 'FAIL' } }] },
  }, { testIdx: 1, success: false, failureReason: 2, testCase: { description: 'leak' }, error: `${field('access')}=${fake} rejected` }] } };
  const text = formatRun({ id: 'eval-x', exp, meta: { label: 'l', note: `note ${jwt}`, flags: { tainted: true }, budget: { limit: 1, spent: 0.1 }, servers: {} } });
  assert.ok(!text.includes('c2lnbmF0dXJl') && !text.includes(fake), text);
  assert.match(text, /leak #1: FAIL/);
  assert.match(text, /leak #2: ERROR/);
  assert.match(text, /tainted/);
});

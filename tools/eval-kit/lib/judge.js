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

import { redact } from '../src/redact.mjs';

const VERDICTS = ['PASS', 'FAIL', 'UNKNOWN'];
export const EVIDENCE_MAX_CHARS = 200_000;
const DEFAULT_TIMEOUT_S = 180;
export const VERDICT_SCHEMA = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: VERDICTS }, reason: { type: 'string' } },
  required: ['verdict', 'reason'],
  additionalProperties: false,
};

const EVIDENCE = {
  truth: 'TRUTH holds what the platform APIs returned when the reply was graded.',
  toolResults: 'TRUTH holds the tool calls the assistant made and what they returned.',
};

const short = (name) => String(name).split('__').pop();

function evidenceText(kind, context) {
  let value;
  if (kind === 'truth') {
    value = context.metadata?.truth;
    if (value === undefined || value === null) throw new Error('judge: evidence "truth" needs metadata.truth from the provider');
  } else if (kind === 'toolResults') {
    value = (context.metadata?.toolCalls ?? []).filter((c) => String(c.name).startsWith('mcp__'))
      .map((c) => ({ tool: short(c.name), input: c.input, isError: c.is_error, output: c.output }));
  } else {
    throw new Error(`judge: evidence must be "truth" or "toolResults", got ${kind}`);
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length > EVIDENCE_MAX_CHARS) throw new Error(`judge: evidence too large: ${text.length} chars, over the ${EVIDENCE_MAX_CHARS} limit`);
  return text;
}

export function judgePrompt({ rubric, evidence, reply, subject = 'an assistant', kind = 'truth' }) {
  return [
    `You grade one reply of ${subject}. Use only the material below; you have no tools.`,
    `${EVIDENCE[kind]} RUBRIC says what the reply must get right.`,
    'Answer PASS when the reply meets the rubric against TRUTH, FAIL when it does not, UNKNOWN when TRUTH is not enough to decide.',
    'Give one short reason.',
    `\n<rubric>\n${rubric}\n</rubric>`,
    `\n<truth>\n${evidence}\n</truth>`,
    `\n<reply>\n${reply || '(no reply)'}\n</reply>`,
  ].join('\n');
}

function parseVerdict(output) {
  let v = output;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      v = undefined;
    }
  }
  if (!v || !VERDICTS.includes(v.verdict)) throw new Error('judge: no verdict in the judge reply');
  return { verdict: v.verdict, reason: String(v.reason ?? '') };
}

async function judgeProvider(context) {
  const p = context.test?.options?.provider;
  if (!p) throw new Error('judge: set defaultTest.options.provider (or the test\'s options.provider) to the judge');
  if (typeof p.callApi === 'function') return p;
  const { loadApiProvider } = await import('promptfoo');
  return typeof p === 'string' ? loadApiProvider(p) : loadApiProvider(p.id, { options: p });
}

const modelOf = (p) => p.config?.model ?? p.options?.config?.model ?? p.id?.() ?? 'unknown';

function withTimeout(run, ms) {
  const ctl = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new Error(`judge: timed out after ${ms / 1000} s`));
    }, ms);
  });
  return Promise.race([run(ctl.signal), timeout]).finally(() => clearTimeout(timer));
}

export async function verdict(output, context) {
  const cfg = context.config ?? {};
  if (typeof cfg.rubric !== 'string' || !cfg.rubric.trim()) throw new Error('judge: config.rubric is required');
  const kind = cfg.evidence ?? 'toolResults';
  const timeoutS = cfg.timeoutS ?? DEFAULT_TIMEOUT_S;
  if (!(timeoutS > 0)) throw new Error('judge: config.timeoutS must be a positive number');
  const reply = typeof output === 'string' ? output : JSON.stringify(output ?? '');
  const prompt = judgePrompt({ rubric: cfg.rubric, evidence: evidenceText(kind, context), reply, subject: cfg.subject, kind });
  const provider = await judgeProvider(context);
  const callContext = { vars: {}, prompt: { raw: prompt, label: 'judge', config: { output_format: { type: 'json_schema', schema: VERDICT_SCHEMA } } } };
  const res = await withTimeout((abortSignal) => provider.callApi(prompt, callContext, { abortSignal }), timeoutS * 1000);
  if (res?.error) throw new Error(`judge: ${redact(String(res.error)).slice(0, 500)}`);
  const v = parseVerdict(res?.output);
  return {
    pass: v.verdict === 'PASS',
    score: v.verdict === 'PASS' ? 1 : 0,
    reason: `${v.verdict}: ${v.reason}`,
    metadata: { verdict: v.verdict, judgeCostUsd: Number(res.cost) || 0, judgeModel: modelOf(provider) },
  };
}

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

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MARKER } from '../lib/budget.js';
import { exportEval, latestEvalId } from './promptfoo.mjs';
import { baselineId, defaultPair, EVAL_ID, listRuns, loadRun, pin, RefError, resolveRef, runDir } from './results.mjs';
import { RESULTS_DIR, suitePaths } from './suite.mjs';
import { diffTools, LEGACY_SERVER, runTools } from './tools.mjs';

export { baselineId, pin, resolveRef };

const ERROR = 2;
const CACHE_SHIFT_POINTS = 20;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : undefined;
};
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const short = (name) => String(name).split('__').pop();

export function toolPath(names) {
  const runs = [];
  for (const n of names) {
    if (runs.at(-1)?.[0] === n) runs.at(-1)[1] += 1;
    else runs.push([n, 1]);
  }
  return runs.map(([n, k]) => (k > 1 ? `${n} x${k}` : n)).join(' > ') || '(none)';
}
const modelOf = (p) => (typeof p === 'string' ? p : p?.config?.model ?? p?.id);
const components = (r) => r.gradingResult?.componentResults ?? [];
export const isUnknown = (r) => components(r).some((c) => c.metadata?.verdict === 'UNKNOWN');
export const isBudgetStop = (r) => String(r.error ?? r.response?.error ?? '').includes(MARKER);

export function summarize(exp) {
  const cfg = exp.config ?? {};
  const combos = exp.results?.prompts ?? [];
  const cases = new Map();
  for (const r of exp.results?.results ?? []) {
    const { sessionId, ...vars } = r.testCase?.vars ?? {};
    const content = JSON.stringify({ prompts: cfg.prompts, vars, assert: r.testCase?.assert });
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
    const combo = combos.length > 1 ? `[${combos[r.promptIdx]?.provider ?? ''}/${r.promptIdx}] ` : '';
    const name = `${combo}${r.testCase?.description ?? `#${hash}`}`;
    if (!cases.has(name)) {
      cases.set(name, { k: 0, n: 0, e: 0, unknown: 0, budgetStops: 0, turnsList: [], costs: [], judgeCost: 0, promptTokens: [], cacheHits: [], callCounts: {}, tools: new Set(), hashes: new Set() });
    }
    const c = cases.get(name);
    c.hashes.add(hash);
    for (const x of components(r)) c.judgeCost += Number(x.metadata?.judgeCostUsd) || 0;
    if (r.failureReason === ERROR) {
      c.e += 1;
      if (isBudgetStop(r)) c.budgetStops += 1;
      continue;
    }
    const meta = r.response?.metadata ?? {};
    c.n += 1;
    if (isUnknown(r)) c.unknown += 1;
    else if (r.success) c.k += 1;
    c.turnsList.push(meta.numTurns ?? 0);
    c.costs.push(r.response?.cost ?? r.cost ?? 0);
    const calls = meta.toolCalls ?? [];
    for (const t of calls) c.callCounts[short(t.name)] = (c.callCounts[short(t.name)] ?? 0) + 1;
    c.tools.add(toolPath(calls.map((t) => short(t.name))));
    const tu = r.response?.tokenUsage;
    if (tu?.prompt > 0) {
      c.promptTokens.push(tu.prompt);
      c.cacheHits.push((100 * (tu.completionDetails?.cacheReadInputTokens ?? 0)) / tu.prompt);
    }
  }
  for (const c of cases.values()) {
    c.hash = [...c.hashes].sort().join('+');
    c.turns = median(c.turnsList) ?? 0;
    c.cost = c.costs.reduce((a, b) => a + b, 0);
    c.agentCost = avg(c.costs);
    c.inputTokens = avg(c.promptTokens);
    c.cacheHitPct = median(c.cacheHits);
    c.calls = Object.fromEntries(Object.entries(c.callCounts).map(([t, k]) => [t, k / Math.max(c.n, 1)]));
  }
  const model = [cfg.providers ?? []].flat().map(modelOf).join(', ') || undefined;
  return { id: exp.evalId, model, judge: modelOf(cfg.defaultTest?.options?.provider), cases };
}

export function passesCase(c, rule = '2of3') {
  const runs = c.n + c.e;
  if (!runs) return false;
  return rule === 'all' ? c.k === runs : c.k * 3 >= runs * 2;
}

export const passes = (c) => passesCase(c, '2of3');

const fmtPass = (c) => `${c.k}/${c.n}${c.e ? `+${c.e}e` : ''}${c.unknown ? ` ${c.unknown}?` : ''}`;
const fmtNum = (v, digits = 1) => (v === undefined ? '-' : Number.isInteger(v) ? String(v) : v.toFixed(digits));
const fmtCost = (v) => (v === undefined ? '-' : v.toFixed(3));

export function caseLine(name, c, rule = '2of3') {
  const verdict = passesCase(c, rule) ? 'PASS' : c.e && !c.n ? 'ERROR' : 'FAIL';
  return `${name}: ${fmtPass(c)} ${verdict} | turns ${c.turns} | agent $/run ${fmtCost(c.agentCost ?? 0)} | tools ${[...c.tools].sort().join(', ')}`;
}

export function move(ka, na, kb, nb) {
  if (!na || !nb) return '';
  const n = Math.max(na, nb);
  const delta = (kb / nb) * n - (ka / na) * n;
  if (Math.abs(delta) >= Math.ceil(n / 2) - 1e-9) return delta > 0 ? 'UP' : 'DOWN';
  return Math.abs(delta) > 1e-9 ? '~' : '=';
}

const statsOf = (c) => ({
  k: c.k, n: c.n, e: c.e, unknown: c.unknown, turns: c.turns, inputTokens: c.inputTokens, cacheHitPct: c.cacheHitPct,
  agentCost: c.agentCost, calls: c.calls, tools: [...c.tools].sort(),
});

const NO_FLAGS = { partial: false, tainted: false, errored: false };

function toolChanges(toolsA, toolsB) {
  const a = { ...toolsA };
  const b = { ...toolsB };
  const named = (x) => Object.keys(x).filter((k) => k !== LEGACY_SERVER);
  if (a[LEGACY_SERVER] && named(b).length === 1) a[named(b)[0]] ??= a[LEGACY_SERVER];
  if (b[LEGACY_SERVER] && named(a).length === 1) b[named(a)[0]] ??= b[LEGACY_SERVER];
  const out = {};
  for (const s of [...new Set([...named(a), ...named(b)])].sort()) {
    const [x, y] = [a[s], b[s]];
    if (!x || !y) continue;
    const served = diffTools(x.served ?? x.upstream ?? [], y.served ?? y.upstream ?? []);
    const upstream = new Set(x.upstream && y.upstream ? diffTools(x.upstream, y.upstream) : served);
    const changes = served.map((c) => (upstream.has(c) ? c : `${c} (overlay)`));
    if (changes.length) out[s] = changes;
  }
  return out;
}

export function compare(a, b, { metaA, metaB, toolsA = {}, toolsB = {} } = {}) {
  const reasons = [];
  if (a.model !== b.model) reasons.push(`model ${a.model} -> ${b.model}`);
  if (a.judge !== b.judge) reasons.push(`judge ${a.judge} -> ${b.judge}`);
  for (const s of Object.keys(metaA?.servers ?? {}).filter((s) => s in (metaB?.servers ?? {})).sort()) {
    if (metaA.servers[s].url !== metaB.servers[s].url) reasons.push(`${s} URL ${metaA.servers[s].url} -> ${metaB.servers[s].url}`);
  }
  const common = [...a.cases.keys()].filter((n) => b.cases.has(n)).sort();
  const notInBoth = [...new Set([...a.cases.keys(), ...b.cases.keys()])].filter((n) => !common.includes(n)).sort();
  let up = 0;
  let down = 0;
  let noise = 0;
  let errors = 0;
  let costA = 0;
  let costB = 0;
  const rows = common.map((name) => {
    const [x, y] = [a.cases.get(name), b.cases.get(name)];
    if (x.hash !== y.hash) reasons.push(`${name} changed`);
    if (x.n + x.e !== y.n + y.e) reasons.push(`${name} runs ${x.n + x.e} -> ${y.n + y.e}`);
    errors += x.e + y.e;
    const mv = move(x.k, x.n, y.k, y.n);
    up += +(mv === 'UP');
    down += +(mv === 'DOWN');
    noise += +(mv === '~');
    if (x.agentCost !== undefined && y.agentCost !== undefined) {
      costA += x.agentCost;
      costB += y.agentCost;
    }
    const cacheShift = x.cacheHitPct !== undefined && y.cacheHitPct !== undefined && Math.abs(y.cacheHitPct - x.cacheHitPct) > CACHE_SHIFT_POINTS;
    return {
      case: name, a: statsOf(x), b: statsOf(y), move: mv,
      turnsFlag: x.n > 0 && y.n > 0 && Math.abs(y.turns - x.turns) >= 2,
      costFlag: !cacheShift && !!x.agentCost && y.agentCost !== undefined && Math.abs(y.agentCost - x.agentCost) / x.agentCost >= 0.25,
      cacheShift,
    };
  });
  const verdict = reasons.length ? 'NOT COMPARABLE' : errors ? 'INCONCLUSIVE' : down ? 'WORSE' : up ? 'BETTER' : 'NO CHANGE';
  const flags = { a: { ...NO_FLAGS, ...metaA?.flags }, b: { ...NO_FLAGS, ...metaB?.flags } };
  const warnings = [];
  for (const side of ['a', 'b']) {
    const f = flags[side];
    const id = side === 'a' ? a.id : b.id;
    if (f.tainted) warnings.push(`${side.toUpperCase()} ${id} is tainted: tools changed during the run`);
    if (f.partial) warnings.push(`${side.toUpperCase()} ${id} is partial: the budget stopped some calls`);
    if (f.errored) warnings.push(`${side.toUpperCase()} ${id} has errored runs`);
  }
  return {
    a: a.id, b: b.id, verdict, reasons, rows, up, down, noise, errors, notInBoth,
    toolsChanged: toolChanges(toolsA, toolsB),
    agentCostChange: costA ? (costB - costA) / costA : undefined,
    cacheWarmthDiffers: rows.some((r) => r.cacheShift),
    flags, warnings, model: b.model, judge: b.judge,
    labels: { a: metaA?.label ?? null, b: metaB?.label ?? null },
  };
}

export function compareRuns(refA, refB, { resultsDir = RESULTS_DIR } = {}) {
  const [idA, idB] = defaultPair(refA, refB, { resultsDir });
  const A = loadRun(idA, { resultsDir });
  const B = loadRun(idB, { resultsDir });
  return compare(summarize(A.exp), summarize(B.exp), { metaA: A.meta, metaB: B.meta, toolsA: runTools(A.dir), toolsB: runTools(B.dir) });
}

export function formatCompare(c) {
  const name = (side) => `${c[side]}${c.labels[side] ? ` (${c.labels[side]})` : ''}`;
  const lines = [`A ${name('a')}`, `B ${name('b')}`];
  for (const [s, changes] of Object.entries(c.toolsChanged)) lines.push(`tools changed [${s}]: ${changes.join('; ')}`);
  for (const w of c.warnings) lines.push(`warning: ${w}`);
  for (const r of c.rows) {
    const calls = [...new Set([...Object.keys(r.a.calls), ...Object.keys(r.b.calls)])].sort()
      .map((t) => `${t} ${(r.a.calls[t] ?? 0).toFixed(1)}->${(r.b.calls[t] ?? 0).toFixed(1)}`).join(' ');
    lines.push(`${r.case}: ${fmtPass(r.a)} -> ${fmtPass(r.b)} ${r.move}`
      + ` | turns ${r.a.turns}->${r.b.turns}${r.turnsFlag ? ' !' : ''}`
      + ` | in tok/run ${fmtNum(r.a.inputTokens, 0)}->${fmtNum(r.b.inputTokens, 0)}`
      + ` | cache ${fmtNum(r.a.cacheHitPct, 0)}%->${fmtNum(r.b.cacheHitPct, 0)}%`
      + ` | agent $/run ${fmtCost(r.a.agentCost)}->${fmtCost(r.b.agentCost)}${r.costFlag ? ' !' : r.cacheShift ? ' (cache)' : ''}`
      + `${calls ? ` | calls/run ${calls}` : ''}`
      + ` | tools ${r.a.tools.join(', ')} -> ${r.b.tools.join(', ')}`);
  }
  for (const n of c.notInBoth) lines.push(`${n}: only in one run`);
  const cost = c.agentCostChange !== undefined ? `; agent cost ${c.agentCostChange >= 0 ? '+' : ''}${Math.round(c.agentCostChange * 100)}%` : '';
  const warmth = c.cacheWarmthDiffers ? ' (prompt cache warmth differs)' : '';
  lines.push(`verdict: ${c.verdict}   ${c.up} up, ${c.down} down, ${c.noise} within noise; errors ${c.errors}${cost}${warmth}`);
  for (const r of c.reasons) lines.push(`not comparable: ${r}`);
  return lines.join('\n');
}

async function ensureExport(id, { dir, resultsDir }) {
  if (!EVAL_ID.test(id)) return;
  const file = path.join(runDir(id, resultsDir), 'eval.json');
  if (!fs.existsSync(file)) await exportEval(id, file, { dir });
}

async function latestRef(p) {
  if (listRuns(p.results).length) return 'latest';
  const id = await latestEvalId({ dir: p.dir });
  if (!id) throw new RefError('no runs yet');
  return id;
}

export async function pinMain([ref], { dir } = {}) {
  const p = suitePaths(dir);
  const id = !ref || ref === 'latest' ? resolveRef(await latestRef(p), { resultsDir: p.results }) : resolveRef(ref, { resultsDir: p.results });
  await ensureExport(id, { dir: p.dir, resultsDir: p.results });
  pin(id, p.results);
  console.log(`baseline: ${id}`);
  return 0;
}

export async function compareMain(args, { dir } = {}) {
  const p = suitePaths(dir);
  const json = args.includes('--json');
  const refs = args.filter((x) => !x.startsWith('--'));
  if (refs.length > 2) {
    console.error('usage: eval-kit compare [A] [B] [--json]');
    return 2;
  }
  const [refA, refB = await latestRef(p)] = refs;
  for (const r of [refA, refB, refA === undefined ? baselineId(p.results) : undefined]) {
    if (r) await ensureExport(r, { dir: p.dir, resultsDir: p.results });
  }
  const c = compareRuns(refA, refB, { resultsDir: p.results });
  console.log(json ? JSON.stringify(c, null, 2) : formatCompare(c));
  return c.verdict === 'WORSE' ? 1 : 0;
}

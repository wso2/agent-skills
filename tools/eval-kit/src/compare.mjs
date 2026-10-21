import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { latestEvalId, promptfoo } from './promptfoo.mjs';
import { RESULTS_DIR } from './suite.mjs';

const ERROR = 2;
const EVAL_ID = /^eval-[\w:.-]+$/;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const short = (name) => name.split('__').pop();
const modelOf = (p) => (typeof p === 'string' ? p : p?.config?.model ?? p?.id);

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
    if (!cases.has(name)) cases.set(name, { k: 0, n: 0, e: 0, turns: [], cost: 0, tools: new Set(), hashes: new Set() });
    const c = cases.get(name);
    c.hashes.add(hash);
    if (r.failureReason === ERROR) {
      c.e += 1;
      continue;
    }
    const meta = r.response?.metadata ?? {};
    c.n += 1;
    c.k += r.success ? 1 : 0;
    c.turns.push(meta.numTurns ?? 0);
    c.cost += r.response?.cost ?? r.cost ?? 0;
    c.tools.add((meta.toolCalls ?? []).map((t) => short(t.name)).join(' > ') || '(none)');
  }
  for (const c of cases.values()) c.hash = [...c.hashes].sort().join('+');
  const model = [cfg.providers ?? []].flat().map(modelOf).join(', ') || undefined;
  return { id: exp.evalId, model, judge: modelOf(cfg.defaultTest?.options?.provider), cases };
}

export const passes = (c) => c.n + c.e > 0 && c.k * 3 >= (c.n + c.e) * 2;

export function caseLine(name, c) {
  const err = c.e ? `+${c.e}e` : '';
  return `${name}: ${c.k}/${c.n}${err} ${passes(c) ? 'PASS' : c.e ? 'ERROR' : 'FAIL'} | turns ${median(c.turns)} | agent $/run ${(c.cost / Math.max(c.n, 1)).toFixed(3)} | tools ${[...c.tools].sort().join(', ')}`;
}

export function compare(a, b) {
  const lines = [];
  const moves = [];
  const reasons = [];
  if (a.model !== b.model) reasons.push(`model ${a.model} -> ${b.model}`);
  if (a.judge !== b.judge) reasons.push(`judge ${a.judge} -> ${b.judge}`);
  for (const name of [...new Set([...a.cases.keys(), ...b.cases.keys()])].sort()) {
    const x = a.cases.get(name);
    const y = b.cases.get(name);
    if (!x || !y) {
      lines.push(`${name}: only in ${y ? 'B' : 'A'}`);
      continue;
    }
    if (x.hash !== y.hash) reasons.push(`${name} changed`);
    if (x.n + x.e !== y.n + y.e) reasons.push(`${name} runs ${x.n + x.e} -> ${y.n + y.e}`);
    const d = y.k - x.k;
    const need = Math.ceil(Math.max(x.n, y.n) / 2);
    const move = !d ? '=' : d >= need ? 'UP' : d <= -need ? 'DOWN' : '~';
    moves.push(move);
    const [tx, ty] = [median(x.turns), median(y.turns)];
    const [cx, cy] = [x.cost / Math.max(x.n, 1), y.cost / Math.max(y.n, 1)];
    lines.push(`${name}: ${x.k}/${x.n}${x.e ? `+${x.e}e` : ''} -> ${y.k}/${y.n}${y.e ? `+${y.e}e` : ''} ${move}`
      + ` | turns ${tx}->${ty}${Math.abs(ty - tx) >= 2 ? ' !' : ''}`
      + ` | agent $/run ${cx.toFixed(3)}->${cy.toFixed(3)}${cx && Math.abs(cy - cx) / cx >= 0.25 ? ' !' : ''}`
      + ` | tools ${[...x.tools].sort().join(', ')} -> ${[...y.tools].sort().join(', ')}`);
  }
  const errors = [...a.cases.values(), ...b.cases.values()].some((c) => c.e);
  const verdict = reasons.length ? 'NOT COMPARABLE' : errors ? 'INCONCLUSIVE'
    : moves.includes('DOWN') ? 'WORSE' : moves.includes('UP') ? 'BETTER' : 'NO CHANGE';
  return { lines, verdict, reasons };
}

export function baselineId() {
  try {
    const id = fs.readFileSync(path.join(RESULTS_DIR, 'BASELINE'), 'utf8').trim();
    return EVAL_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function pin(id) {
  if (!EVAL_ID.test(id)) throw new Error(`not an eval id: ${id}`);
  fs.mkdirSync(RESULTS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(RESULTS_DIR, 'BASELINE'), `${id}\n`, { mode: 0o600 });
}

export async function loadExport(ref) {
  if (!EVAL_ID.test(ref)) return JSON.parse(fs.readFileSync(ref, 'utf8'));
  const file = path.join(RESULTS_DIR, ref, 'eval.json');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const { code } = await promptfoo(['export', 'eval', ref, '-o', file], { capture: true });
    if (code !== 0) throw new Error(`cannot export ${ref}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export async function pinMain([ref]) {
  const id = ref === 'latest' || !ref ? await latestEvalId() : ref;
  pin(id);
  console.log(`baseline: ${id}`);
  return 0;
}

export async function compareMain(args) {
  const refA = args[0] ?? baselineId();
  const refB = args[1] ?? (await latestEvalId());
  if (!refA || !refB) {
    console.error('usage: eval-kit compare [A] [B]; with no A, pin a baseline first: eval-kit pin <eval id>');
    return 2;
  }
  const { lines, verdict, reasons } = compare(summarize(await loadExport(refA)), summarize(await loadExport(refB)));
  console.log(`A ${refA}\nB ${refB}`);
  for (const l of lines) console.log(l);
  for (const r of reasons) console.log(`not comparable: ${r}`);
  console.log(`verdict: ${verdict}`);
  return verdict === 'WORSE' ? 1 : 0;
}

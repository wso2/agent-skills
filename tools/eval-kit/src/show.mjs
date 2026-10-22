import { isBudgetStop, isUnknown } from './compare.mjs';
import { clip, redact } from './redact.mjs';
import { loadRun } from './results.mjs';
import { suitePaths } from './suite.mjs';

const ERROR = 2;
const short = (name) => String(name).split('__').pop();

function rowVerdict(r) {
  if (r.failureReason === ERROR) return isBudgetStop(r) ? 'NOT RUN' : 'ERROR';
  return isUnknown(r) ? 'UNKNOWN' : r.success ? 'PASS' : 'FAIL';
}

export function formatRun({ id, exp, meta }, { filter, full = false } = {}) {
  const lines = [`${id}${meta?.label ? ` (${meta.label})` : ''}${meta?.note ? `: ${redact(meta.note)}` : ''}`];
  if (meta) {
    const flags = Object.entries(meta.flags ?? {}).filter(([, v]) => v).map(([k]) => k);
    lines.push(`  ${meta.startedAt} -> ${meta.endedAt}; budget $${meta.budget?.spent?.toFixed?.(3) ?? '?'} of $${meta.budget?.limit}${flags.length ? `; ${flags.join(', ')}` : ''}`);
    for (const [name, s] of Object.entries(meta.servers ?? {})) lines.push(`  server ${name}: ${s.url} tools ${s.tools?.before} -> ${s.tools?.after}`);
    if (Object.keys(meta.suiteFlags ?? {}).length) lines.push(`  flags: ${redact(Object.entries(meta.suiteFlags).map(([k, v]) => `--${k} ${v}`).join(' '))}`);
  }
  const seen = new Map();
  for (const r of exp.results?.results ?? []) {
    const name = r.testCase?.description ?? `#${r.testIdx}`;
    if (filter && !name.includes(filter)) continue;
    seen.set(name, (seen.get(name) ?? 0) + 1);
    const m = r.response?.metadata ?? {};
    const cost = r.response?.cost ?? r.cost;
    lines.push(`\n${name} #${seen.get(name)}: ${rowVerdict(r)}${m.numTurns !== undefined ? ` | turns ${m.numTurns}` : ''}${cost !== undefined ? ` | $${Number(cost).toFixed(3)}` : ''}`);
    const calls = (m.toolCalls ?? []).map((t) => short(t.name));
    if (calls.length) lines.push(`  tools: ${calls.join(' > ')}`);
    for (const c of r.gradingResult?.componentResults ?? []) if (c.reason) lines.push(`  ${c.assertion?.type ?? 'assert'}: ${clip(c.reason, 400, full)}`);
    if (r.error && r.failureReason === ERROR) lines.push(`  error: ${clip(r.error, 400, full)}`);
    if (r.response?.output !== undefined) lines.push(`  reply: ${clip(r.response.output, 600, full)}`);
  }
  return lines.join('\n');
}

export function showMain(args, { dir } = {}) {
  const p = suitePaths(dir);
  const pos = args.filter((a) => !a.startsWith('--'));
  const run = loadRun(pos[0], { resultsDir: p.results });
  console.log(formatRun(run, { filter: pos[1], full: args.includes('--full') }));
  return 0;
}

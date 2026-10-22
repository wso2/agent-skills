import { isUnknown, passesCase, summarize } from './compare.mjs';
import { redact } from './redact.mjs';
import { baselineId, listRuns, loadRun } from './results.mjs';
import { suitePaths } from './suite.mjs';

function runSummary(run, rule = '2of3') {
  const { cases } = summarize(run.exp);
  const rows = run.exp.results?.results ?? [];
  const judgeCost = rows.flatMap((r) => r.gradingResult?.componentResults ?? []).reduce((s, c) => s + (Number(c.metadata?.judgeCostUsd) || 0), 0);
  return {
    id: run.id,
    label: run.meta?.label ?? null,
    note: run.meta?.note ?? null,
    startedAt: run.meta?.startedAt ?? null,
    cases: cases.size,
    passed: [...cases.values()].filter((c) => passesCase(c, run.meta?.pass ?? rule)).length,
    unknown: rows.filter(isUnknown).length,
    flags: Object.entries(run.meta?.flags ?? {}).filter(([, v]) => v).map(([k]) => k),
    agentCostUsd: [...cases.values()].reduce((s, c) => s + c.cost, 0),
    judgeCostUsd: judgeCost,
  };
}

export function listMain(args, { dir } = {}) {
  const p = suitePaths(dir);
  const base = baselineId(p.results);
  const runs = listRuns(p.results).map((r) => ({ ...runSummary(loadRun(r.id, { resultsDir: p.results })), baseline: r.id === base }));
  if (args.includes('--json')) {
    console.log(JSON.stringify(runs, null, 2));
    return 0;
  }
  if (!runs.length) console.log('no runs under results/');
  for (const r of runs) {
    console.log([
      `${r.baseline ? '*' : ' '} ${r.id}`, r.label ?? '-', r.startedAt ?? '-', `${r.passed}/${r.cases} pass`,
      r.unknown ? `${r.unknown}?` : '', r.flags.join(',') , `$${(r.agentCostUsd + r.judgeCostUsd).toFixed(3)}`, r.note ? redact(r.note) : '',
    ].filter(Boolean).join('  '));
  }
  return 0;
}

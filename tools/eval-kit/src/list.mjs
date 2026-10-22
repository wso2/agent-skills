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

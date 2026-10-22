import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LIMIT_USD, MARKER } from '../lib/budget.js';
import { caseLine, compareRuns, formatCompare, isBudgetStop, passesCase, summarize } from './compare.mjs';
import { getToken } from './login.mjs';
import { promptfoo, promptfooEnv } from './promptfoo.mjs';
import { redact } from './redact.mjs';
import { baselineId, EVAL_ID, labelError, readJson, resolveRef } from './results.mjs';
import { loadSuite, parseBudget, requireSuiteDir, suitePaths } from './suite.mjs';
import { hashTools, listTools, writeSnapshot } from './tools.mjs';

const ERROR = 2;
const EXIT = { ok: 0, failing: 1, usage: 2, preflight: 3, infra: 4 };

class UsageError extends Error {}

export function parseRunArgs(args, suiteFlags = {}) {
  const kit = { label: undefined, note: undefined, budget: undefined, compare: true, flags: {}, filterFailing: undefined };
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      rest.push(...args.slice(i + 1));
      break;
    }
    if (arg === '-o' || arg === '-c') throw new UsageError(`${arg} is set by eval-kit: the config is promptfooconfig.yaml and results go to results/<eval id>/`);
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq < 0 ? undefined : eq);
    const inline = eq < 0 ? undefined : arg.slice(eq + 1);
    const next = () => inline ?? (args[i + 1] !== undefined && !args[i + 1].startsWith('-') ? args[++i] : undefined);
    const required = () => {
      const v = next();
      if (v === undefined || v === '') throw new UsageError(`--${name} needs a value`);
      return v;
    };
    if (name === 'label') kit.label = required();
    else if (name === 'note') kit.note = required();
    else if (name === 'budget') kit.budget = parseBudget(required(), '--budget');
    else if (name === 'no-compare') kit.compare = false;
    else if (name === 'filter-failing') kit.filterFailing = required();
    else if (name === 'output' || name === 'config') throw new UsageError(`--${name} is set by eval-kit: the config is promptfooconfig.yaml and results go to results/<eval id>/`);
    else if (Object.hasOwn(suiteFlags, name)) kit.flags[name] = next() ?? suiteFlags[name].value ?? '1';
    else rest.push(arg);
  }
  const bad = kit.label === undefined ? null : labelError(kit.label);
  if (bad) throw new UsageError(bad);
  return { kit, rest };
}

export const flagEnv = (suiteFlags, values) => Object.fromEntries(Object.entries(values).map(([name, v]) => [suiteFlags[name].env, String(v)]));

export function flagsOf({ results = [], budget, tools = {} }) {
  const stops = results.filter(isBudgetStop);
  return {
    partial: (budget?.refused ?? 0) > 0 || stops.length > 0,
    tainted: Object.values(tools).some((t) => !t.after || t.before !== t.after),
    errored: results.some((r) => r.failureReason === ERROR && !isBudgetStop(r)),
  };
}

export function exitCode({ flags, failing = 0, verdict }) {
  if (flags.partial || flags.tainted || flags.errored) return EXIT.infra;
  if (failing > 0 || verdict === 'WORSE') return EXIT.failing;
  return EXIT.ok;
}

function gitState(dir) {
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    return { head: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain', '--', '.') !== '' };
  } catch {
    return { head: null, dirty: null };
  }
}

export function buildMeta({ evalId, kit, suite, servers, flags, budget, git, startedAt, endedAt, args, version }) {
  return {
    kit: version,
    evalId,
    label: kit.label ?? null,
    note: kit.note ?? null,
    startedAt,
    endedAt,
    servers: Object.fromEntries(servers.map((s) => [s.name, {
      url: s.url,
      ...(s.authFrom && s.authFrom !== s.url && { authFrom: s.authFrom }),
      origin: s.origin,
      tools: { before: s.before ?? null, after: s.after ?? null },
    }])),
    flags,
    budget: { limit: budget.limit, spent: budget.spent ?? null, refused: budget.refused ?? null },
    ...(git && { git }),
    suiteFlags: { ...kit.flags },
    pass: suite.pass,
    args: args.map((a) => redact(a)),
  };
}

const kitVersion = () => readJson(new URL('../package.json', import.meta.url))?.version ?? 'unknown';

async function snapshot(server, stateDir, minTtl) {
  const { token } = await getToken(server, { stateDir, minTtl, browser: minTtl > 0 });
  return { token, tools: await listTools(server.url, token) };
}

export async function runEval(args, { dir } = {}) {
  requireSuiteDir(dir);
  const s = loadSuite(dir);
  const p = suitePaths(s.dir);
  let parsed;
  try {
    parsed = parseRunArgs(args, s.flags);
  } catch (e) {
    console.error(e.message);
    return EXIT.usage;
  }
  const { kit, rest } = parsed;
  const envBudget = process.env.EVAL_BUDGET_USD;
  let limit;
  try {
    limit = kit.budget ?? (envBudget ? parseBudget(envBudget, 'EVAL_BUDGET_USD') : (s.budgetUsd ?? DEFAULT_LIMIT_USD));
  } catch (e) {
    console.error(e.message);
    return EXIT.usage;
  }

  const servers = [];
  const extra = {};
  try {
    for (const server of s.servers) {
      const { token, tools } = await snapshot(server, p.state, 1800);
      servers.push({ ...server, beforeTools: tools, before: hashTools(tools) });
      if (server.env) Object.assign(extra, { [`${server.env}_URL`]: server.url, [`${server.env}_TOKEN`]: token });
    }
  } catch (e) {
    console.error(`preflight: ${redact(e.message)}`);
    return EXIT.preflight;
  }

  if (kit.filterFailing) {
    const ref = kit.filterFailing;
    const id = EVAL_ID.test(ref) || fs.existsSync(ref) ? ref : resolveRef(ref, { resultsDir: p.results });
    rest.push('--filter-failing', id);
  }

  fs.mkdirSync(p.results, { recursive: true, mode: 0o700 });
  const runDir = path.join(p.results, `.run-${process.pid}`);
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.mkdirSync(runDir, { mode: 0o700 });
  for (const sv of servers) writeSnapshot(path.join(runDir, 'tools', `${sv.name}.json`), sv.beforeTools);
  const out = path.join(runDir, 'eval.json');
  const repeat = rest.some((a) => a === '--repeat' || a.startsWith('--repeat=')) ? [] : ['--repeat', '3'];
  const description = kit.label || kit.note ? ['--description', [kit.label, kit.note].filter(Boolean).join(': ')] : [];
  const env = promptfooEnv({ ...extra, ...flagEnv(s.flags, kit.flags), EVAL_KIT_RUN_DIR: runDir, EVAL_BUDGET_USD: String(limit) }, { dir: s.dir });
  const git = s.gitScope ? gitState(path.resolve(s.dir, s.gitScope)) : undefined;
  const startedAt = new Date().toISOString();
  const { code, signal } = await promptfoo(['eval', '-c', 'promptfooconfig.yaml', '--no-cache', '--no-share', ...repeat, ...description, '-o', out, ...rest],
    { dir: s.dir, env, conditions: s.conditions });
  const endedAt = new Date().toISOString();
  if (!fs.existsSync(out)) {
    console.error(`promptfoo ${signal ? `stopped by ${signal}` : `exited ${code}`} without results; partial artefacts in ${runDir}`);
    return signal ? EXIT.infra : code || EXIT.usage;
  }

  for (const sv of servers) {
    try {
      const { tools } = await snapshot(sv, p.state, 0);
      sv.after = hashTools(tools);
      if (sv.after !== sv.before) writeSnapshot(path.join(runDir, 'tools', `${sv.name}.after.json`), tools);
    } catch (e) {
      console.error(`${sv.name}: cannot list tools after the run: ${redact(e.message)}`);
      sv.after = null;
    }
  }

  const exp = JSON.parse(fs.readFileSync(out, 'utf8'));
  const budget = { limit, ...readJson(path.join(runDir, 'budget.json')), limit };
  const results = exp.results?.results ?? [];
  const flags = flagsOf({ results, budget, tools: Object.fromEntries(servers.map((sv) => [sv.name, sv])) });
  const meta = buildMeta({ evalId: exp.evalId, kit, suite: s, servers, flags, budget, git, startedAt, endedAt, args: rest, version: kitVersion() });
  fs.writeFileSync(path.join(runDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
  const final = path.join(p.results, exp.evalId);
  if (fs.existsSync(final)) throw new Error(`${final} already exists; results left in ${runDir}`);
  fs.renameSync(runDir, final);

  const { cases } = summarize(exp);
  for (const [name, c] of cases) console.log(caseLine(name, c, s.pass));
  const ok = [...cases.values()].filter((c) => passesCase(c, s.pass)).length;
  console.log(`${exp.evalId}${kit.label ? ` (${kit.label})` : ''}: ${ok}/${cases.size} cases pass (${s.pass === 'all' ? 'all runs' : '2 of 3 runs'})`);
  if (flags.partial) console.log(`partial: ${MARKER} $${limit} reached; some calls did not start`);
  if (flags.tainted) console.log(`tainted: tools changed during the run (${servers.filter((sv) => sv.before !== sv.after).map((sv) => sv.name).join(', ')})`);
  if (flags.errored) console.log('errored: some runs ended in an error');

  let verdict;
  const base = kit.compare ? baselineId(p.results) : null;
  if (base && base !== exp.evalId && fs.existsSync(path.join(p.results, base, 'eval.json'))) {
    try {
      const c = compareRuns(base, exp.evalId, { resultsDir: p.results });
      console.log(`\n${formatCompare(c)}`);
      verdict = c.verdict;
    } catch (e) {
      console.error(`cannot compare with the baseline ${base}: ${redact(e.message)}`);
    }
  }
  return exitCode({ flags, failing: cases.size - ok, verdict });
}

import fs from 'node:fs';
import path from 'node:path';

export const MARKER = 'eval-kit budget:';
export const DEFAULT_LIMIT_USD = 2;
const KEY = Symbol.for('@wso2/eval-kit/budget');

function parseLimit(raw) {
  if (raw === undefined || raw === '') return DEFAULT_LIMIT_USD;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`EVAL_BUDGET_USD must be a non-negative number, got ${raw}`);
  return n;
}

function report(s) {
  console.error(`${MARKER} spent $${s.spent.toFixed(3)} of $${s.limit} (agent and judge)${s.refused ? `; ${s.refused} calls not started` : ''}`);
  const dir = process.env.EVAL_KIT_RUN_DIR;
  if (!dir) return;
  try {
    fs.writeFileSync(path.join(dir, 'budget.json'), `${JSON.stringify({ limit: s.limit, spent: s.spent, refused: s.refused })}\n`, { mode: 0o600 });
  } catch {}
}

function state() {
  let s = globalThis[KEY];
  if (!s) {
    s = { limit: parseLimit(process.env.EVAL_BUDGET_USD), spent: 0, refused: 0 };
    globalThis[KEY] = s;
    process.on('exit', () => report(s));
  }
  return s;
}

export const limit = () => state().limit;
export const spent = () => state().spent;
export const exhausted = () => state().spent >= state().limit;

export function add(cost) {
  const n = Number(cost);
  if (Number.isFinite(n) && n > 0) state().spent += n;
}

export function refuse() {
  const s = state();
  s.refused += 1;
  return `${MARKER} $${s.limit} reached ($${s.spent.toFixed(3)} spent); call not started`;
}


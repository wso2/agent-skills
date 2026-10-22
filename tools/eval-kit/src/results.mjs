import fs from 'node:fs';
import path from 'node:path';
import { RESULTS_DIR } from './suite.mjs';

export const EVAL_ID = /^eval-[\w:.-]+$/;
export const LABEL = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
export const RESERVED_LABELS = ['latest', 'baseline', 'previous'];

export function labelError(label) {
  if (!LABEL.test(label)) return `label ${label}: start with a letter; then letters, digits, '.', '_' and '-' (64 at most)`;
  if (RESERVED_LABELS.includes(label.toLowerCase())) return `label ${label} is reserved (${RESERVED_LABELS.join(', ')})`;
  if (EVAL_ID.test(label)) return `label ${label} looks like an eval id`;
  return null;
}
const STAMP = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/;

export class RefError extends Error {}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

export const runDir = (id, resultsDir = RESULTS_DIR) => (path.isAbsolute(id) ? id : path.join(resultsDir, id));
const readMeta = (dir) => readJson(path.join(dir, 'meta.json'));

const startedAt = (id, meta) => meta?.startedAt ?? (STAMP.exec(id)?.[1] ? `${STAMP.exec(id)[1]}.000Z` : '');

export function listRuns(resultsDir = RESULTS_DIR) {
  if (!fs.existsSync(resultsDir)) return [];
  return fs.readdirSync(resultsDir)
    .filter((id) => EVAL_ID.test(id) && fs.existsSync(path.join(resultsDir, id, 'eval.json')))
    .map((id) => {
      const meta = readMeta(path.join(resultsDir, id));
      return { id, meta, startedAt: startedAt(id, meta) };
    })
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
}

export function baselineId(resultsDir = RESULTS_DIR) {
  try {
    const id = fs.readFileSync(path.join(resultsDir, 'BASELINE'), 'utf8').trim();
    return EVAL_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function pin(id, resultsDir = RESULTS_DIR) {
  if (!EVAL_ID.test(id)) throw new RefError(`not an eval id: ${id}`);
  fs.mkdirSync(resultsDir, { recursive: true, mode: 0o700 });
  const file = path.join(resultsDir, 'BASELINE');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${id}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function resolveRef(ref, { resultsDir = RESULTS_DIR } = {}) {
  const runs = listRuns(resultsDir);
  if (ref === undefined || ref === 'latest') {
    if (!runs.length) throw new RefError(`no runs under ${resultsDir}`);
    return runs.at(-1).id;
  }
  if (ref === 'baseline') {
    const id = baselineId(resultsDir);
    if (!id) throw new RefError('no baseline: eval-kit pin <ref>');
    return id;
  }
  if (EVAL_ID.test(ref)) return ref;
  if (path.isAbsolute(ref) && fs.existsSync(path.join(ref, 'eval.json'))) return ref;
  if (LABEL.test(ref)) {
    const hit = runs.filter((r) => r.meta?.label === ref).at(-1);
    if (hit) return hit.id;
  }
  throw new RefError(`no run ${ref}: use an eval id, a label, latest or baseline`);
}

function previousRun(id, resultsDir = RESULTS_DIR) {
  const runs = listRuns(resultsDir);
  const at = runs.findIndex((r) => r.id === id);
  return at > 0 ? runs[at - 1].id : null;
}

export function defaultPair(refA, refB, { resultsDir = RESULTS_DIR } = {}) {
  const b = resolveRef(refB, { resultsDir });
  if (refA !== undefined) return [resolveRef(refA, { resultsDir }), b];
  const base = baselineId(resultsDir);
  if (base && base !== b) return [base, b];
  const prev = previousRun(b, resultsDir);
  if (!prev) throw new RefError(`nothing to compare ${b} with: pin a baseline or run again`);
  return [prev, b];
}

export function loadRun(ref, { resultsDir = RESULTS_DIR } = {}) {
  const id = resolveRef(ref, { resultsDir });
  const dir = runDir(id, resultsDir);
  const exp = readJson(path.join(dir, 'eval.json'));
  if (!exp) throw new RefError(`no ${path.join(dir, 'eval.json')}`);
  return { id: path.isAbsolute(id) ? exp.evalId ?? path.basename(id) : id, dir, exp, meta: readMeta(dir) };
}

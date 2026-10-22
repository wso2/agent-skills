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


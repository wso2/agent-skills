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
import { checkUrl } from './url.mjs';

export const SUITE_DIR = process.cwd();
export const RESULTS_DIR = path.join(SUITE_DIR, 'results');
export const STATE_DIR = path.join(SUITE_DIR, '.state');

export const suitePaths = (dir = SUITE_DIR, stateDir = '.state') => ({
  dir,
  results: path.join(dir, 'results'),
  promptfoo: path.join(dir, '.promptfoo'),
  state: path.resolve(dir, stateDir),
});

const SUITE_FILE = 'suite.json';
const LOCAL_FILE = 'suite.local.json';
const NAME = /^[a-z0-9-]+$/;
const ENV = /^[A-Z][A-Z0-9_]*$/;
export const CONDITION = /^[@\w][\w@./-]*$/;
const FLAG_NAME = /^[a-z][a-z0-9-]*$/;
const FLAG_ENV = /^EVAL_[A-Z0-9_]+$/;
const RESERVED_FLAG_ENV = /^(EVAL_KIT_|EVAL_BUDGET_USD$)/;
const KIT_FLAGS = new Set(['label', 'note', 'budget', 'no-compare', 'filter-failing', 'repeat', 'output', 'config', 'description', 'help']);
const LEGACY = ['server', 'env', 'clientId', 'callbackPort', 'url', 'authFrom', 'authServer'];
const PASS_RULES = new Set(['2of3', 'all']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export class SuiteError extends Error {}

function readObject(file) {
  if (!fs.existsSync(file)) return undefined;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new SuiteError(`${file}: ${e.message}`);
  }
  if (!isObject(data)) throw new SuiteError(`${file}: not a JSON object`);
  return data;
}

function splitLegacy(raw, file) {
  const legacy = Object.fromEntries(LEGACY.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]));
  const rest = Object.fromEntries(Object.entries(raw).filter(([k]) => !LEGACY.includes(k)));
  if (Object.keys(legacy).length && rest.servers !== undefined) throw new SuiteError(`${file}: use servers[] or the top-level server fields, not both`);
  if (rest.servers !== undefined && !Array.isArray(rest.servers)) throw new SuiteError(`${file}: servers must be an array`);
  return { legacy: Object.keys(legacy).length ? legacy : undefined, rest };
}

const legacyServer = ({ server, ...fields }) => ({ name: server ?? 'default', ...fields });

function mergeServers(base, local, origin) {
  const out = base.map((s) => ({ ...s }));
  for (const entry of local) {
    const at = out.findIndex((s) => s.name === entry.name);
    if (at < 0) out.push({ ...entry, origin });
    else out[at] = { ...out[at], ...entry, ...(entry.url !== undefined && { origin }) };
  }
  return out;
}

function validateServers(servers) {
  const seen = { name: new Set(), port: new Set(), env: new Set() };
  for (const s of servers) {
    const at = `server ${s.name ?? '(no name)'}`;
    if (typeof s.name !== 'string' || !NAME.test(s.name)) throw new SuiteError(`${at}: name must match ${NAME}`);
    if (s.env !== undefined && (typeof s.env !== 'string' || !ENV.test(s.env))) throw new SuiteError(`${at}: env must match ${ENV}`);
    if (typeof s.clientId !== 'string' || !s.clientId) throw new SuiteError(`${at}: clientId is required`);
    if (!Number.isInteger(s.callbackPort) || s.callbackPort < 1 || s.callbackPort > 65535) throw new SuiteError(`${at}: callbackPort must be 1-65535`);
    if (typeof s.url !== 'string' || !s.url) throw new SuiteError(`${at}: url is required`);
    checkUrl(s.url, `${at} url`);
    checkUrl(s.authFrom, `${at} authFrom`);
    if (s.authServer !== undefined) {
      if (typeof s.authServer !== 'string' || !s.authServer) throw new SuiteError(`${at}: authServer must be a URL`);
      checkUrl(s.authServer, `${at} authServer`);
    }
    for (const [k, v] of [['name', s.name], ['port', s.callbackPort], ['env', s.env]]) {
      if (v === undefined) continue;
      if (seen[k].has(v)) throw new SuiteError(`duplicate server ${k}: ${v}`);
      seen[k].add(v);
    }
  }
}

function validateFlags(flags) {
  if (!isObject(flags)) throw new SuiteError('flags must be an object');
  const envs = new Set();
  for (const [name, f] of Object.entries(flags)) {
    if (!FLAG_NAME.test(name) || KIT_FLAGS.has(name)) throw new SuiteError(`flag ${name}: name must match ${FLAG_NAME} and not be a kit flag`);
    if (!isObject(f) || typeof f.env !== 'string' || !FLAG_ENV.test(f.env) || RESERVED_FLAG_ENV.test(f.env)) {
      throw new SuiteError(`flag ${name}: env must match ${FLAG_ENV} and not start with EVAL_KIT_ or be EVAL_BUDGET_USD`);
    }
    if (f.value !== undefined && typeof f.value !== 'string') throw new SuiteError(`flag ${name}: value must be a string`);
    if (envs.has(f.env)) throw new SuiteError(`flag ${name}: env ${f.env} is used by another flag`);
    envs.add(f.env);
  }
}

function validateConditions(conditions) {
  if (!Array.isArray(conditions)) throw new SuiteError('conditions must be an array');
  for (const c of conditions) {
    if (typeof c !== 'string' || !CONDITION.test(c)) throw new SuiteError(`condition ${JSON.stringify(c)} must match ${CONDITION}`);
  }
  return conditions;
}

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function validateStateDir(stateDir, gitScope, dir) {
  if (typeof stateDir !== 'string' || !stateDir || path.isAbsolute(stateDir)) throw new SuiteError('stateDir must be a relative path');
  const state = path.resolve(dir, stateDir);
  if (gitScope === undefined) {
    if (!inside(path.resolve(dir), state)) throw new SuiteError(`stateDir ${stateDir} must be inside the suite folder when gitScope is not set`);
  } else if (!inside(path.resolve(dir, gitScope), state)) {
    throw new SuiteError(`stateDir ${stateDir} must be inside gitScope ${gitScope}`);
  }
}

export function parseBudget(raw, what) {
  const n = typeof raw === 'number' ? raw : raw === undefined || raw === '' ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new SuiteError(`${what} must be a non-negative number, got ${raw}`);
  return n;
}

export function loadSuite(dir = SUITE_DIR, env = process.env) {
  const suiteFile = path.join(dir, SUITE_FILE);
  const base = splitLegacy(readObject(suiteFile) ?? {}, SUITE_FILE);
  const local = splitLegacy(readObject(path.join(dir, LOCAL_FILE)) ?? {}, LOCAL_FILE);
  const origins = Object.fromEntries(Object.keys(base.rest).map((k) => [k, SUITE_FILE]));

  for (const s of [...(base.rest.servers ?? []), ...(local.rest.servers ?? [])]) {
    if (!isObject(s)) throw new SuiteError('each server must be an object');
  }
  let servers = (base.rest.servers ?? (base.legacy ? [legacyServer(base.legacy)] : [])).map((s) => ({ ...s, origin: SUITE_FILE }));
  if (base.legacy || base.rest.servers) origins.servers = SUITE_FILE;
  if (local.legacy) {
    if (servers.length !== 1) throw new SuiteError(`${LOCAL_FILE}: top-level server fields need exactly one server in ${SUITE_FILE}`);
    const { server, ...fields } = local.legacy;
    servers = mergeServers(servers, [{ ...fields, name: server ?? servers[0].name }], LOCAL_FILE);
    origins.servers = LOCAL_FILE;
  }
  const merged = { ...base.rest };
  for (const [k, v] of Object.entries(local.rest)) {
    if (k === 'servers') servers = mergeServers(servers, v, LOCAL_FILE);
    else if (k === 'flags' && isObject(v) && isObject(merged.flags)) merged.flags = { ...merged.flags, ...v };
    else merged[k] = v;
    origins[k] = LOCAL_FILE;
  }

  if ((env.MCP_URL || env.MCP_AUTH_FROM) && servers.length) {
    if (servers.length !== 1) throw new SuiteError('MCP_URL and MCP_AUTH_FROM apply only to a suite with exactly one server; set urls in suite.local.json');
    if (env.MCP_URL) servers[0] = { ...servers[0], url: env.MCP_URL, origin: 'MCP_URL' };
    if (env.MCP_AUTH_FROM) servers[0] = { ...servers[0], authFrom: env.MCP_AUTH_FROM };
  }
  servers = servers.map((s) => ({ ...s, authFrom: s.authFrom || s.url }));
  validateServers(servers);

  const { conditions = [], flags = {}, pass = '2of3', budgetUsd, gitScope, stateDir = '.state', ...rest } = merged;
  delete rest.servers;
  validateConditions(conditions);
  validateFlags(flags);
  if (!PASS_RULES.has(pass)) throw new SuiteError(`pass must be "2of3" or "all", got ${pass}`);
  if (budgetUsd !== undefined) parseBudget(budgetUsd, 'budgetUsd');
  if (gitScope !== undefined && (typeof gitScope !== 'string' || !gitScope)) throw new SuiteError('gitScope must be a path');
  validateStateDir(stateDir, gitScope, dir);
  return { ...rest, servers, conditions, flags, pass, budgetUsd, gitScope, stateDir, origins, dir };
}

export function requireSuiteDir(dir = SUITE_DIR) {
  if (!fs.existsSync(path.join(dir, 'promptfooconfig.yaml'))) throw new SuiteError(`no promptfooconfig.yaml in ${dir}: run from the suite directory`);
}

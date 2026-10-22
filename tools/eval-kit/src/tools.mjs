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
import { getToken, pickServers } from './login.mjs';
import { baselineId, resolveRef, runDir } from './results.mjs';
import { loadSuite, requireSuiteDir, suitePaths } from './suite.mjs';
import { checkUrl } from './url.mjs';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (!isObject(v)) return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
}

export const canonical = (tools) => [...tools].sort((a, b) => a.name.localeCompare(b.name)).map(sortKeys);
export const hashTools = (tools) => createHash('sha256').update(JSON.stringify(canonical(tools))).digest('hex').slice(0, 12);

function fieldDiff(a, b, at, out) {
  if (isObject(a) && isObject(b)) {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const p = `${at}.${k}`;
      if (!(k in a)) out.push(`+ ${p}: ${JSON.stringify(b[k])}`);
      else if (!(k in b)) out.push(`- ${p}: ${JSON.stringify(a[k])}`);
      else fieldDiff(a[k], b[k], p, out);
    }
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push(`~ ${at}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  }
}

export function diffTools(before, after) {
  const a = new Map(before.map((t) => [t.name, t]));
  const b = new Map(after.map((t) => [t.name, t]));
  const out = [];
  for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    if (!a.has(name)) out.push(`+ ${name}`);
    else if (!b.has(name)) out.push(`- ${name}`);
    else fieldDiff(sortKeys(a.get(name)), sortKeys(b.get(name)), name, out);
  }
  return out;
}

function parseRpc(text, id) {
  const bodies = text.trimStart().startsWith('{') ? [text] : [...text.matchAll(/^data: ?(.*)$/gm)].map((m) => m[1]);
  for (const body of bodies) {
    try {
      const msg = JSON.parse(body);
      if (msg.id === id) return msg;
    } catch {}
  }
  return null;
}

export async function listTools(url, token) {
  checkUrl(url);
  let session;
  let id = 0;
  const rpc = async (method, params, notify = false) => {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}`,
      'mcp-protocol-version': '2025-06-18', ...(session && { 'mcp-session-id': session }) };
    const msg = notify ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', id: ++id, method, params };
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(msg), redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    session ??= res.headers.get('mcp-session-id') ?? undefined;
    const text = await res.text();
    if (notify) return null;
    if (res.status !== 200) throw new Error(`${method}: HTTP ${res.status}`);
    const reply = parseRpc(text, msg.id);
    if (!reply || reply.error) throw new Error(`${method}: ${reply?.error?.message ?? 'no reply'}`);
    return reply.result;
  };
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-evals', version: '1.0.0' } });
  await rpc('notifications/initialized', undefined, true);
  const tools = [];
  let cursor;
  do {
    const page = await rpc('tools/list', cursor ? { cursor } : {});
    tools.push(...(page.tools ?? []));
    cursor = page.nextCursor;
  } while (cursor);
  return canonical(tools);
}

export function writeSnapshot(file, tools) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(tools, null, 2) + '\n', { mode: 0o600 });
}

function readToolsFile(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tools = Array.isArray(data) ? data : data?.tools;
    return Array.isArray(tools) ? canonical(tools) : undefined;
  } catch {
    return undefined;
  }
}

export const LEGACY_SERVER = '';

export function runTools(dir) {
  const out = {};
  for (const kind of ['tools', 'served']) {
    const sub = path.join(dir, kind);
    if (!fs.existsSync(sub)) continue;
    for (const f of fs.readdirSync(sub).filter((f) => /^[a-z0-9-]+\.json$/.test(f))) {
      const tools = readToolsFile(path.join(sub, f));
      if (tools) (out[f.slice(0, -5)] ??= {})[kind === 'tools' ? 'upstream' : 'served'] = tools;
    }
  }
  const legacy = readToolsFile(path.join(dir, 'tools.json'));
  if (legacy && !Object.keys(out).length) out[LEGACY_SERVER] = { upstream: legacy };
  return out;
}

export async function toolsMain(args, { dir } = {}) {
  requireSuiteDir(dir);
  const s = loadSuite(dir);
  const p = suitePaths(s.dir);
  if (!s.servers.length) throw new Error('suite.json has no MCP servers');
  const servers = pickServers(s.servers, args);
  const diffAt = args.indexOf('--diff');
  let ref;
  let snapshots;
  if (diffAt >= 0) {
    const arg = args[diffAt + 1];
    ref = arg && !arg.startsWith('--') ? resolveRef(arg, { resultsDir: p.results }) : baselineId(p.results);
    if (!ref) {
      console.error('no baseline: eval-kit pin <ref>, or eval-kit tools --diff <ref>');
      return 2;
    }
    snapshots = runTools(runDir(ref, p.results));
  }
  const all = {};
  for (const server of servers) {
    const { token } = await getToken(server, { stateDir: p.state });
    const tools = await listTools(server.url, token);
    if (!snapshots) {
      all[server.name] = tools;
      continue;
    }
    const old = (snapshots[server.name] ?? (s.servers.length === 1 ? snapshots[LEGACY_SERVER] : undefined))?.upstream;
    if (!old) {
      console.log(`[${server.name}] no snapshot in ${ref}`);
      continue;
    }
    const lines = diffTools(old, tools);
    console.log(lines.length ? lines.map((l) => `[${server.name}] ${l}`).join('\n') : `[${server.name}] no tool changes since ${ref}`);
  }
  if (!snapshots) console.log(JSON.stringify(s.servers.length === 1 ? all[servers[0].name] : all, null, 2));
  return 0;
}

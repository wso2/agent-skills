import fs from 'node:fs';
import path from 'node:path';
import { baselineId } from './compare.mjs';
import { getToken } from './login.mjs';
import { loadSuite, RESULTS_DIR } from './suite.mjs';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (!isObject(v)) return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
}

export const canonical = (tools) => [...tools].sort((a, b) => a.name.localeCompare(b.name)).map(sortKeys);

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

export async function toolsMain(args) {
  const s = loadSuite();
  if (!s.url) throw new Error('suite.json has no MCP url');
  const { accessToken } = await getToken({ url: s.authFrom, clientId: s.clientId, callbackPort: s.callbackPort });
  const tools = await listTools(s.url, accessToken);
  if (!args.includes('--diff')) {
    console.log(JSON.stringify(tools, null, 2));
    return 0;
  }
  const ref = args[args.indexOf('--diff') + 1] ?? baselineId();
  if (!/^eval-[\w:.-]+$/.test(ref ?? '')) {
    console.error('no baseline: eval-kit pin <eval id>');
    return 2;
  }
  const lines = diffTools(JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, ref, 'tools.json'), 'utf8')), tools);
  console.log(lines.length ? lines.join('\n') : `no tool changes since ${ref}`);
  return 0;
}

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

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { redact } from './redact.mjs';
import { loadSuite, requireSuiteDir, STATE_DIR, suitePaths } from './suite.mjs';
import { checkUrl, LoginError } from './url.mjs';

export { checkUrl, LoginError };

const TIMEOUT_MS = 30_000;
const CALLBACK_TIMEOUT_MS = 300_000;
const LOCK_STALE_MS = CALLBACK_TIMEOUT_MS + 60_000;
const STATE_FILE = /^[0-9a-f]{16}\.json(\.lock|\.\d+\.tmp)?$/;

const b64url = (buf) => buf.toString('base64url');
const issuerKey = (u) => u.href.replace(/\/$/, '');
const now = () => Math.floor(Date.now() / 1000);

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status !== 200) return null;
    const data = await res.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function challengeMetadataUrl(url) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-evals-login', version: '1.0.0' } } });
  try {
    const res = await fetch(url, { method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' } });
    await res.body?.cancel();
    if (res.status !== 401) return null;
    return /resource_metadata="([^"]+)"/.exec(res.headers.get('www-authenticate') ?? '')?.[1] ?? null;
  } catch {
    return null;
  }
}

async function discover(url, authServer) {
  const u = checkUrl(url);
  const p = u.pathname.replace(/\/$/, '');
  const head = p.slice(0, p.lastIndexOf('/'));
  const seg = p.slice(p.lastIndexOf('/') + 1);
  const candidates = [await challengeMetadataUrl(url),
    `${u.origin}${head}/.well-known/oauth-protected-resource/${seg}`, `${u.origin}/.well-known/oauth-protected-resource${p}`];
  let prm = null;
  for (const c of candidates.filter(Boolean)) {
    checkUrl(c, 'resource metadata');
    if ((prm = await getJson(c))) break;
  }
  if (!prm) throw new LoginError('resource metadata', `none found for ${url}`);
  const resource = String(prm.resource ?? '');
  if (resource.replace(/\/$/, '') !== url.replace(/\/$/, '')) throw new LoginError('resource metadata', `resource ${resource} does not match ${url}`);
  const issuer = String(prm.authorization_servers?.[0] ?? '').replace(/\/$/, '');
  const step = 'authorization server metadata';
  if (!issuer) throw new LoginError('resource metadata', 'no authorization_servers listed');
  const named = issuerKey(checkUrl(issuer, step));
  if (authServer && named !== authServer) throw new LoginError('resource metadata', `authorization server ${issuer} is not the expected ${authServer}`);
  const as = (await getJson(`${issuer}/.well-known/oauth-authorization-server`)) ?? (await getJson(`${issuer}/.well-known/openid-configuration`));
  if (!as) throw new LoginError(step, `none found under ${issuer}`);
  if (!as.authorization_endpoint || !as.token_endpoint) throw new LoginError(step, 'authorization or token endpoint missing');
  checkUrl(as.authorization_endpoint, step);
  checkUrl(as.token_endpoint, step);
  if (as.code_challenge_methods_supported && !as.code_challenge_methods_supported.includes('S256')) throw new LoginError(step, 'S256 PKCE not supported');
  const scope = ['openid', ...(prm.scopes_supported ?? []).filter((s) => s !== 'openid')].join(' ');
  return { resource, issuer: named, authorizationEndpoint: as.authorization_endpoint, tokenEndpoint: as.token_endpoint, scope };
}

export function statePath(url, clientId, stateDir = STATE_DIR) {
  const key = createHash('sha256').update(`${url}\n${clientId}`).digest('hex').slice(0, 16);
  return path.join(stateDir, `${key}.json`);
}

function readCache(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function writeCache(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
  if (fs.lstatSync(tmp).isFile()) fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, file);
}

function lockOwner(lock) {
  try {
    return Number(fs.readFileSync(lock, 'utf8')) || 0;
  } catch {
    return 0;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

async function withLock(file, fn) {
  const lock = `${file}.lock`;
  for (let waiting = false; ; ) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = lockOwner(lock);
      const age = Date.now() - (fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if ((owner && !alive(owner)) || age > LOCK_STALE_MS) {
        fs.rmSync(lock, { force: true });
        continue;
      }
      if (!waiting) process.stderr.write(`waiting for another sign-in to finish (${lock})\n`);
      waiting = true;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  try {
    return await fn();
  } finally {
    if (lockOwner(lock) === process.pid) fs.rmSync(lock, { force: true });
  }
}

async function tokenRequest(tokenEndpoint, form) {
  let res;
  try {
    res = await fetch(tokenEndpoint, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(form) });
  } catch (e) {
    return { error: e.message };
  }
  const payload = await res.json().catch(() => ({}));
  if (res.status !== 200 || !payload?.access_token) {
    return { error: redact(`HTTP ${res.status} ${payload?.error ?? ''} ${payload?.error_description ?? ''}`.trim()) };
  }
  return { tokens: payload };
}

function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

async function browserCode(meta, clientId, callbackPort, openUrl) {
  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const redirectUri = `http://127.0.0.1:${callbackPort}/callback`;
  const auth = new URL(meta.authorizationEndpoint);
  for (const [k, v] of Object.entries({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
    state, resource: meta.resource, scope: meta.scope })) auth.searchParams.set(k, v);

  const params = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, redirectUri);
      const got = Buffer.from(u.searchParams.get('state') ?? '');
      if (u.pathname !== '/callback') return res.writeHead(404).end();
      if (got.length !== state.length || !timingSafeEqual(got, Buffer.from(state))) return res.writeHead(400).end('state mismatch\n');
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Sign-in finished. You can close this tab.\n');
      done(null, Object.fromEntries(u.searchParams));
    });
    const timer = setTimeout(() => done(new LoginError('callback', `no sign-in callback within ${CALLBACK_TIMEOUT_MS / 1000} s`)), CALLBACK_TIMEOUT_MS);
    const done = (err, value) => {
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
      err ? reject(err) : resolve(value);
    };
    server.on('error', (e) => done(new LoginError('callback', `cannot listen on 127.0.0.1:${callbackPort}: ${e.message}`)));
    server.listen(callbackPort, '127.0.0.1', () => {
      process.stderr.write(`Sign in at: ${auth}\n`);
      openUrl?.(auth.toString());
    });
  });
  if (params.error) throw new LoginError('authorize', `${params.error}: ${params.error_description ?? ''}`);
  if (!params.code) throw new LoginError('callback', 'no authorization code returned');
  return { code: params.code, verifier, redirectUri };
}

function jwtExp(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp;
  } catch {
    return undefined;
  }
}

const inflight = new Map();

const sameSignIn = (cache, s) => cache?.url === s.authFrom && cache.client_id === s.clientId && (!s.authServer || cache.auth_server === s.authServer);

function fromCache(cache, s, minTtl) {
  if (!sameSignIn(cache, s) || !cache.access_token) return null;
  return cache.expires_at - now() >= minTtl ? { token: cache.access_token, expiresAt: cache.expires_at, via: 'cache' } : null;
}

async function obtain(file, s, { browser, openUrl, minTtl, force }) {
  const cache = force ? null : readCache(file);
  const hit = fromCache(cache, s, minTtl);
  if (hit) return hit;
  const usable = sameSignIn(cache, s) && cache.refresh_token;
  let meta;
  let tokenEndpoint = usable ? cache.token_endpoint : undefined;
  let resource = usable ? cache.resource : undefined;
  let result = { error: 'not signed in' };
  let via = 'refresh';
  if (usable) {
    if (!tokenEndpoint || !resource) {
      meta = await discover(s.authFrom, s.authServer);
      ({ tokenEndpoint, resource } = meta);
    }
    checkUrl(tokenEndpoint, 'token endpoint');
    result = await tokenRequest(tokenEndpoint, { grant_type: 'refresh_token', refresh_token: cache.refresh_token, client_id: s.clientId, resource });
  }
  if (!result.tokens) {
    if (!browser) throw new LoginError('sign-in', `${s.name}: ${result.error}; run eval-kit login --server ${s.name}`);
    meta ??= await discover(s.authFrom, s.authServer);
    ({ tokenEndpoint, resource } = meta);
    const { code, verifier, redirectUri } = await browserCode(meta, s.clientId, s.callbackPort, openUrl);
    result = await tokenRequest(tokenEndpoint, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: s.clientId, code_verifier: verifier, resource });
    if (!result.tokens) throw new LoginError('token', `code redemption failed: ${result.error}`);
    via = 'browser';
  }
  const t = result.tokens;
  const record = {
    url: s.authFrom, client_id: s.clientId, auth_server: meta?.issuer ?? cache?.auth_server, resource, token_endpoint: tokenEndpoint, access_token: t.access_token,
    refresh_token: t.refresh_token ?? (via === 'refresh' ? cache.refresh_token : null),
    expires_at: t.expires_in ? now() + Number(t.expires_in) : (jwtExp(t.access_token) ?? now()),
  };
  writeCache(file, record);
  return { token: record.access_token, expiresAt: record.expires_at, via };
}

export async function getToken(server, { browser = true, openUrl = openInBrowser, minTtl = 60, force = false, stateDir = STATE_DIR, authServer } = {}) {
  const s = { ...server, name: server.name ?? 'default', authFrom: server.authFrom || server.url };
  checkUrl(s.authFrom, `${s.name} url`);
  const want = authServer ?? server.authServer;
  s.authServer = want == null ? undefined : issuerKey(checkUrl(want, `${s.name} authServer`));
  const file = statePath(s.authFrom, s.clientId, stateDir);
  if (!force) {
    const hit = fromCache(readCache(file), s, minTtl);
    if (hit) return hit;
    const pending = inflight.get(file);
    if (pending) {
      await pending.catch(() => null);
      const shared = fromCache(readCache(file), s, minTtl);
      if (shared) return shared;
    }
  }
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(stateDir).isDirectory()) fs.chmodSync(stateDir, 0o700);
  const p = withLock(file, () => obtain(file, s, { browser, openUrl, minTtl, force }));
  inflight.set(file, p);
  p.catch(() => {}).finally(() => inflight.get(file) === p && inflight.delete(file));
  return p;
}

export function logout(server, stateDir = STATE_DIR) {
  fs.rmSync(statePath(server.authFrom || server.url, server.clientId, stateDir), { force: true });
}

export function logoutAll(stateDir = STATE_DIR) {
  if (!fs.existsSync(stateDir)) return 0;
  const files = fs.readdirSync(stateDir).filter((f) => STATE_FILE.test(f));
  for (const f of files) fs.rmSync(path.join(stateDir, f), { force: true });
  return files.length;
}

export function pickServers(servers, args) {
  const at = args.indexOf('--server');
  if (at < 0) return servers;
  const name = args[at + 1];
  const hit = servers.filter((s) => s.name === name);
  if (!hit.length) throw new LoginError('usage', `no server ${name ?? '(missing)'}; servers: ${servers.map((s) => s.name).join(', ') || 'none'}`);
  return hit;
}

export async function loginMain(args, { dir } = {}) {
  requireSuiteDir(dir);
  const s = loadSuite(dir);
  const stateDir = suitePaths(s.dir, s.stateDir).state;
  if (args.includes('--logout') && args.includes('--all')) {
    console.log(`signed out of every server (${logoutAll(stateDir)} files removed)`);
    return 0;
  }
  if (!s.servers.length) throw new LoginError('usage', 'suite.json has no MCP servers');
  const servers = pickServers(s.servers, args);
  if (args.includes('--logout')) {
    for (const server of servers) logout(server, stateDir);
    console.log(`signed out of ${servers.map((x) => x.name).join(', ')}`);
    return 0;
  }
  let failed = 0;
  for (const server of servers) {
    try {
      const r = await getToken(server, { force: args.includes('--force'), openUrl: args.includes('--no-browser') ? null : openInBrowser, stateDir });
      console.log(`${server.name}: signed in via ${r.via}; token expires in ${r.expiresAt - now()} s`);
    } catch (e) {
      failed += 1;
      console.error(`${server.name}: ${redact(e.message)}`);
    }
  }
  return failed ? 3 : 0;
}

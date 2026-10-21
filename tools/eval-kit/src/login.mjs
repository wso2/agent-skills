import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { loadSuite, STATE_DIR } from './suite.mjs';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost|(.+\.)?127\.0\.0\.1\.(nip|sslip)\.io)$/;
const TIMEOUT_MS = 30_000;
const CALLBACK_TIMEOUT_MS = 300_000;
const LOCK_STALE_MS = CALLBACK_TIMEOUT_MS + 60_000;

export class LoginError extends Error {
  constructor(step, message) {
    super(`${step}: ${message}`);
    this.step = step;
  }
}

export function checkUrl(url, step = 'url') {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new LoginError(step, `not a URL: ${url}`);
  }
  if (u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOST.test(u.hostname.toLowerCase()))) return u;
  throw new LoginError(step, `use https, or http only for a local host: ${url}`);
}

const b64url = (buf) => buf.toString('base64url');

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

export async function discover(url) {
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
  checkUrl(issuer, step);
  const as = (await getJson(`${issuer}/.well-known/oauth-authorization-server`)) ?? (await getJson(`${issuer}/.well-known/openid-configuration`));
  if (!as) throw new LoginError(step, `none found under ${issuer}`);
  if (!as.authorization_endpoint || !as.token_endpoint) throw new LoginError(step, 'authorization or token endpoint missing');
  checkUrl(as.authorization_endpoint, step);
  checkUrl(as.token_endpoint, step);
  if (as.code_challenge_methods_supported && !as.code_challenge_methods_supported.includes('S256')) throw new LoginError(step, 'S256 PKCE not supported');
  const scope = ['openid', ...(prm.scopes_supported ?? []).filter((s) => s !== 'openid')].join(' ');
  return { resource, authorizationEndpoint: as.authorization_endpoint, tokenEndpoint: as.token_endpoint, scope };
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
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
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
    return { error: `HTTP ${res.status} ${payload?.error ?? ''} ${payload?.error_description ?? ''}`.trim() };
  }
  return { tokens: payload };
}

export function openInBrowser(url) {
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

export async function getToken({ url, clientId, callbackPort, browser = true, openUrl = openInBrowser, minTtl = 60, force = false, stateDir = STATE_DIR }) {
  const meta = await discover(url);
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(stateDir, 0o700);
  const file = statePath(url, clientId, stateDir);
  return withLock(file, async () => {
    const now = () => Math.floor(Date.now() / 1000);
    const cache = force ? null : readCache(file);
    if (cache?.resource === meta.resource && cache.access_token && cache.expires_at - now() >= minTtl) {
      return { accessToken: cache.access_token, expiresAt: cache.expires_at, via: 'cache' };
    }
    let result = { error: 'no cached sign-in' };
    let via = 'refresh';
    if (cache?.refresh_token) {
      result = await tokenRequest(meta.tokenEndpoint, { grant_type: 'refresh_token', refresh_token: cache.refresh_token, client_id: clientId, resource: meta.resource });
    }
    if (!result.tokens) {
      if (!browser) throw new LoginError('refresh', `${result.error}; sign in again with eval-kit login`);
      const { code, verifier, redirectUri } = await browserCode(meta, clientId, callbackPort, openUrl);
      result = await tokenRequest(meta.tokenEndpoint, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource: meta.resource });
      if (!result.tokens) throw new LoginError('token', `code redemption failed: ${result.error}`);
      via = 'browser';
    }
    const t = result.tokens;
    const record = {
      url, client_id: clientId, resource: meta.resource, access_token: t.access_token,
      refresh_token: t.refresh_token ?? (via === 'refresh' ? cache.refresh_token : null),
      expires_at: t.expires_in ? now() + Number(t.expires_in) : (jwtExp(t.access_token) ?? now()),
    };
    writeCache(file, record);
    return { accessToken: record.access_token, expiresAt: record.expires_at, via };
  });
}

export function logout(url, clientId, stateDir = STATE_DIR) {
  fs.rmSync(statePath(url, clientId, stateDir), { force: true });
}

export async function loginMain(args) {
  const s = loadSuite();
  if (!s.url) throw new Error('suite.json has no MCP url');
  if (args.includes('--logout')) {
    logout(s.authFrom, s.clientId);
    console.log('signed out');
    return 0;
  }
  try {
    const r = await getToken({ url: s.authFrom, clientId: s.clientId, callbackPort: s.callbackPort,
      force: args.includes('--force'), openUrl: args.includes('--no-browser') ? null : openInBrowser });
    console.log(`signed in via ${r.via}; token expires in ${r.expiresAt - Math.floor(Date.now() / 1000)} s`);
    return 0;
  } catch (e) {
    console.error(e.message);
    return 3;
  }
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { checkUrl, getToken, LoginError, logoutAll, statePath } from '../src/login.mjs';

let base;
let server;
const hits = [];
const idp = { codes: new Map(), issued: 0, refreshRotates: true, tokenRedirect: false, tokenDelayMs: 0 };

const json = (res, status, body, headers = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));

before(async () => {
  server = http.createServer(async (req, res) => {
    const u = new URL(req.url, base);
    hits.push(`${req.method} ${u.pathname}`);
    let body = '';
    for await (const c of req) body += c;
    const m = /^\/(mcp\d?)$/.exec(u.pathname);
    if (m) return json(res, 401, {}, { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/${m[1]}"` });
    const prm = /^\/\.well-known\/oauth-protected-resource\/(mcp\d?)$/.exec(u.pathname);
    if (prm) return json(res, 200, { resource: `${base}/${prm[1]}`, authorization_servers: [`${base}/idp`], scopes_supported: ['amp:read'] });
    if (u.pathname === '/idp/.well-known/oauth-authorization-server') {
      return json(res, 200, { authorization_endpoint: `${base}/idp/authorize`, token_endpoint: `${base}/idp/token`, code_challenge_methods_supported: ['S256'] });
    }
    if (u.pathname === '/idp/authorize') {
      const q = Object.fromEntries(u.searchParams);
      assert.equal(q.code_challenge_method, 'S256');
      assert.equal(q.scope, 'openid amp:read');
      idp.codes.set('code-1', q);
      return res.writeHead(302, { location: `${q.redirect_uri}?code=code-1&state=${q.state}` }).end();
    }
    if (u.pathname === '/idp/token') {
      if (idp.tokenRedirect) return res.writeHead(307, { location: `${base}/elsewhere` }).end();
      const f = Object.fromEntries(new URLSearchParams(body));
      assert.match(f.resource, /\/mcp\d?$/);
      if (f.grant_type === 'authorization_code') {
        const q = idp.codes.get(f.code);
        if (!q || createHash('sha256').update(f.code_verifier).digest('base64url') !== q.code_challenge || f.redirect_uri !== q.redirect_uri) {
          return json(res, 400, { error: 'invalid_grant' });
        }
      } else if (f.refresh_token !== 'refresh-1') {
        return json(res, 400, { error: 'invalid_grant' });
      }
      if (idp.tokenDelayMs) await new Promise((r) => setTimeout(r, idp.tokenDelayMs));
      idp.issued += 1;
      const rotate = f.grant_type === 'authorization_code' || idp.refreshRotates;
      return json(res, 200, { access_token: `access-${idp.issued}`, expires_in: 3600, ...(rotate && { refresh_token: 'refresh-1' }) });
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());
beforeEach(() => {
  hits.length = 0;
  idp.refreshRotates = true;
  idp.tokenDelayMs = 0;
});

async function freePort() {
  const s = http.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

const browser = async (url) => {
  const res = await fetch(url, { redirect: 'manual' });
  await fetch(res.headers.get('location'));
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'login-test-'));
const srv = async (mcp = 'mcp') => ({ name: mcp, url: `${base}/${mcp}`, clientId: 'am-mcp', callbackPort: await freePort() });

function seed(stateDir, s, record) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(statePath(s.url, s.clientId, stateDir), JSON.stringify({ url: s.url, client_id: s.clientId, resource: s.url, ...record }), { mode: 0o600 });
}

test('signs in with PKCE, caches owner-only, then reuses and refreshes', async () => {
  const stateDir = tmp();
  const s = await srv();
  const first = await getToken(s, { openUrl: browser, stateDir });
  assert.equal(first.via, 'browser');
  assert.match(first.token, /^access-\d+$/);
  const file = statePath(s.url, 'am-mcp', stateDir);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(stateDir).mode & 0o777, 0o700);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).token_endpoint, `${base}/idp/token`);
  assert.equal((await getToken(s, { stateDir })).via, 'cache');

  idp.refreshRotates = false;
  const refreshed = await getToken(s, { minTtl: 7200, browser: false, stateDir });
  assert.equal(refreshed.via, 'refresh');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).refresh_token, 'refresh-1');
  assert.deepEqual(fs.readdirSync(stateDir).filter((f) => f.endsWith('.tmp') || f.endsWith('.lock')), []);
});

test('a cache hit makes no HTTP call', async () => {
  const stateDir = tmp();
  const s = await srv();
  seed(stateDir, s, { access_token: 'cached', expires_at: Math.floor(Date.now() / 1000) + 3600 });
  const r = await getToken(s, { browser: false, stateDir });
  assert.deepEqual(r, { token: 'cached', expiresAt: r.expiresAt, via: 'cache' });
  assert.deepEqual(hits, []);
});

test('a refresh uses the stored token endpoint, without discovery', async () => {
  const stateDir = tmp();
  const s = await srv();
  seed(stateDir, s, { access_token: 'old', refresh_token: 'refresh-1', token_endpoint: `${base}/idp/token`, expires_at: 0 });
  const r = await getToken(s, { browser: false, stateDir });
  assert.equal(r.via, 'refresh');
  assert.deepEqual(hits, ['POST /idp/token']);
});

test('a stored token endpoint must still be https or local', async () => {
  const stateDir = tmp();
  const s = await srv();
  seed(stateDir, s, { access_token: 'old', refresh_token: 'refresh-1', token_endpoint: 'http://evil.example/token', expires_at: 0 });
  await assert.rejects(getToken(s, { browser: false, stateDir }), LoginError);
  assert.deepEqual(hits, []);
});

test('concurrent callers share one refresh', async () => {
  const stateDir = tmp();
  const s = await srv();
  seed(stateDir, s, { access_token: 'old', refresh_token: 'refresh-1', token_endpoint: `${base}/idp/token`, expires_at: 0 });
  idp.tokenDelayMs = 100;
  const tokens = await Promise.all(Array.from({ length: 5 }, () => getToken(s, { browser: false, stateDir })));
  assert.equal(new Set(tokens.map((t) => t.token)).size, 1);
  assert.deepEqual(hits, ['POST /idp/token']);
});

test('each server has its own sign-in', async () => {
  const stateDir = tmp();
  const [a, b] = [await srv('mcp'), await srv('mcp2')];
  const ta = await getToken(a, { openUrl: browser, stateDir });
  const tb = await getToken(b, { openUrl: browser, stateDir });
  assert.notEqual(ta.token, tb.token);
  assert.notEqual(statePath(a.url, a.clientId, stateDir), statePath(b.url, b.clientId, stateDir));
  assert.equal((await getToken(a, { browser: false, stateDir })).token, ta.token);
  assert.equal(logoutAll(stateDir), 2);
  await assert.rejects(getToken(a, { browser: false, stateDir }), /run eval-kit login/);
});

test('without a browser a missing sign-in says to run eval-kit login', async () => {
  await assert.rejects(getToken({ url: `${base}/mcp`, clientId: 'am-mcp', callbackPort: 1 }, { browser: false, stateDir: tmp() }), /not signed in; run eval-kit login/);
});

test('token requests never follow redirects', async () => {
  idp.tokenRedirect = true;
  try {
    await assert.rejects(getToken(await srv(), { openUrl: browser, stateDir: tmp() }), /code redemption failed: HTTP 307/);
    assert.ok(!hits.includes('POST /elsewhere') && !hits.includes('GET /elsewhere'));
  } finally {
    idp.tokenRedirect = false;
  }
});

test('only https or local http URLs', async () => {
  assert.throws(() => checkUrl('http://example.com/mcp'), LoginError);
  assert.throws(() => checkUrl('ftp://localhost/mcp'), LoginError);
  for (const ok of ['https://example.com/mcp', 'http://localhost:9000/mcp', 'http://a.openchoreoapis.localhost:19080/x/mcp', 'http://127.0.0.1:1/mcp', 'http://idp.127.0.0.1.nip.io/']) {
    checkUrl(ok);
  }
  await assert.rejects(getToken({ url: 'http://example.com/mcp', clientId: 'x', callbackPort: 1 }, { stateDir: tmp() }), LoginError);
});

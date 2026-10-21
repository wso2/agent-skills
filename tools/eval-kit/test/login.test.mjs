import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { checkUrl, getToken, LoginError, statePath } from '../src/login.mjs';

let base;
let server;
const hits = [];
const idp = { codes: new Map(), issued: 0, refreshRotates: true, tokenRedirect: false };

const json = (res, status, body, headers = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));

before(async () => {
  server = http.createServer(async (req, res) => {
    const u = new URL(req.url, base);
    hits.push(`${req.method} ${u.pathname}`);
    let body = '';
    for await (const c of req) body += c;
    if (u.pathname === '/mcp') {
      return json(res, 401, {}, { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` });
    }
    if (u.pathname === '/.well-known/oauth-protected-resource/mcp') {
      return json(res, 200, { resource: `${base}/mcp`, authorization_servers: [`${base}/idp`], scopes_supported: ['amp:read'] });
    }
    if (u.pathname === '/idp/.well-known/oauth-authorization-server') {
      return json(res, 200, { authorization_endpoint: `${base}/idp/authorize`, token_endpoint: `${base}/idp/token`, code_challenge_methods_supported: ['S256'] });
    }
    if (u.pathname === '/idp/authorize') {
      const q = Object.fromEntries(u.searchParams);
      assert.equal(q.code_challenge_method, 'S256');
      assert.equal(q.resource, `${base}/mcp`);
      assert.equal(q.scope, 'openid amp:read');
      idp.codes.set('code-1', q);
      return res.writeHead(302, { location: `${q.redirect_uri}?code=code-1&state=${q.state}` }).end();
    }
    if (u.pathname === '/idp/token') {
      if (idp.tokenRedirect) return res.writeHead(307, { location: `${base}/elsewhere` }).end();
      const f = Object.fromEntries(new URLSearchParams(body));
      assert.equal(f.resource, `${base}/mcp`);
      if (f.grant_type === 'authorization_code') {
        const q = idp.codes.get(f.code);
        if (!q || createHash('sha256').update(f.code_verifier).digest('base64url') !== q.code_challenge || f.redirect_uri !== q.redirect_uri) {
          return json(res, 400, { error: 'invalid_grant' });
        }
      } else if (f.refresh_token !== 'refresh-1') {
        return json(res, 400, { error: 'invalid_grant' });
      }
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

test('signs in with PKCE, caches owner-only, then reuses and refreshes', async () => {
  const stateDir = tmp();
  const opts = { url: `${base}/mcp`, clientId: 'am-mcp', callbackPort: await freePort(), openUrl: browser, stateDir };
  const first = await getToken(opts);
  assert.equal(first.via, 'browser');
  assert.equal(first.accessToken, 'access-1');
  const file = statePath(opts.url, 'am-mcp', stateDir);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(stateDir).mode & 0o777, 0o700);
  assert.equal((await getToken(opts)).via, 'cache');

  idp.refreshRotates = false;
  const refreshed = await getToken({ ...opts, minTtl: 7200, browser: false });
  assert.equal(refreshed.via, 'refresh');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).refresh_token, 'refresh-1');
  assert.deepEqual(fs.readdirSync(stateDir).filter((f) => f.endsWith('.tmp') || f.endsWith('.lock')), []);
});

test('without a browser a missing sign-in fails', async () => {
  await assert.rejects(getToken({ url: `${base}/mcp`, clientId: 'am-mcp', callbackPort: 1, browser: false, stateDir: tmp() }), LoginError);
});

test('token requests never follow redirects', async () => {
  idp.tokenRedirect = true;
  hits.length = 0;
  try {
    await assert.rejects(getToken({ url: `${base}/mcp`, clientId: 'am-mcp', callbackPort: await freePort(), openUrl: browser, stateDir: tmp() }), /code redemption failed: HTTP 307/);
    assert.ok(!hits.includes('POST /elsewhere') && !hits.includes('GET /elsewhere'));
  } finally {
    idp.tokenRedirect = false;
  }
});

test('only https or local http URLs', () => {
  assert.throws(() => checkUrl('http://example.com/mcp'), LoginError);
  assert.throws(() => checkUrl('ftp://localhost/mcp'), LoginError);
  for (const ok of ['https://example.com/mcp', 'http://localhost:9000/mcp', 'http://a.openchoreoapis.localhost:19080/x/mcp', 'http://127.0.0.1:1/mcp', 'http://idp.127.0.0.1.nip.io/']) {
    checkUrl(ok);
  }
});

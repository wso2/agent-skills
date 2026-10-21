import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = `
import http from 'node:http';
const s = http.createServer((q, r) => r.end('ok'));
await new Promise((r) => s.listen(String(0), r));
const { address, port } = s.address();
const get = (host) => new Promise((r) => http.get({ port, host: '127.0.0.1', headers: { host } }, (res) => r(res.statusCode)));
console.log(JSON.stringify({ address, local: await get('localhost:' + port), remote: await get('evil.example') }));
s.close();
`;

test('servers bind to 127.0.0.1 and refuse a non-local Host', () => {
  const r = spawnSync(process.execPath, ['--import', new URL('../src/loopback.mjs', import.meta.url).href, '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(r.stdout), { address: '127.0.0.1', local: 200, remote: 403 });
});

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

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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const npm = (args, cwd) => execFileSync('npm', [...args, '--ignore-scripts', '--no-audit', '--no-fund', '--offline'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('the packed kit installs nothing else, and its login entry loads', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eval-kit-no-peers-')));
  try {
    const [{ filename }] = JSON.parse(npm(['pack', '--json', '--pack-destination', dir, KIT], dir));
    fs.writeFileSync(path.join(dir, 'package.json'), '{ "private": true }\n');
    npm(['install', '--no-package-lock', path.join(dir, filename)], dir);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'node_modules')).filter((n) => !n.startsWith('.')), ['@wso2']);
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      const login = await import('@wso2/eval-kit/login');
      const peer = await import('promptfoo').then(() => 'present', (e) => e.code);
      console.log(JSON.stringify({ getToken: typeof login.getToken, peer }));`], { cwd: dir, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out), { getToken: 'function', peer: 'ERR_MODULE_NOT_FOUND' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

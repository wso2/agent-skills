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
import os from 'node:os';
import { test } from 'node:test';
import { nodeArgs, promptfooEnv } from '../src/promptfoo.mjs';

test('the promptfoo env is an allow-list with .env, the scheduler and telemetry off', () => {
  const source = { PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'sk-ant-x', NODE_OPTIONS: '--require /tmp/x.js', AWS_SECRET_ACCESS_KEY: 's', EVAL_BUDGET_USD: '3' };
  const env = promptfooEnv({ EVAL_KIT_RUN_DIR: '/r', DOTENV_PATH: '/home/me/.env', PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: '0' }, { dir: '/suite', source });
  assert.equal(env.DOTENV_PATH, os.devNull);
  assert.equal(env.PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER, '1');
  assert.equal(env.PROMPTFOO_DISABLE_TELEMETRY, '1');
  assert.equal(env.PROMPTFOO_CONFIG_DIR, '/suite/.promptfoo');
  assert.equal(env.EVAL_KIT_RUN_DIR, '/r');
  assert.equal(env.EVAL_BUDGET_USD, '3');
  for (const k of ['ANTHROPIC_API_KEY', 'NODE_OPTIONS', 'AWS_SECRET_ACCESS_KEY']) assert.equal(env[k], undefined);
});

test('conditions become --conditions node args and are validated', () => {
  const args = nodeArgs(['@wso2cloud/source', 'development']);
  assert.deepEqual(args.slice(0, 2), ['--conditions=@wso2cloud/source', '--conditions=development']);
  assert.equal(args[2], '--import');
  assert.match(args[3], /loopback\.mjs$/);
  for (const bad of ['--require x', '-r', 'a b', '', '../x;rm']) assert.throws(() => nodeArgs([bad]), /condition/);
});

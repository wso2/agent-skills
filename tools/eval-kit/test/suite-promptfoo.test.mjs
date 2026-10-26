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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadPromptfoo } from '../lib/promptfoo.js';

const lib = (f) => JSON.stringify(new URL(`../lib/${f}`, import.meta.url).href);
const fake = (kind) => `module.exports = { loadApiProvider: async (id) => ({ id: () => id, callApi: async () => ({ output: id === 'judge' ? { verdict: 'PASS', reason: '${kind}' } : '${kind}' }) }) };`;
const script = `
import Capped from ${lib('capped.js')};
import { verdict } from ${lib('judge.js')};
const capped = await new Capped({ config: { target: 'agent' } }).callApi('hi').then((r) => r.output, (e) => e.message);
const judge = await verdict('x', { test: { options: { provider: 'judge' } }, metadata: { truth: 't' }, config: { rubric: 'r', evidence: 'truth' } }).then((r) => r.reason, (e) => e.message);
console.log(JSON.stringify({ capped, judge }));
`;
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eval-kit-suite-promptfoo-')));

function fakePromptfoo(at, exports, kind = 'suite-esm') {
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(path.join(at, 'package.json'), JSON.stringify({ name: 'promptfoo', version: '0.0.0-fake', ...(exports !== undefined && { exports }) }));
  fs.writeFileSync(path.join(at, 'esm.mjs'), fake(kind).replace('module.exports =', 'export const { loadApiProvider } ='));
  fs.writeFileSync(path.join(at, 'cjs.cjs'), fake('suite-cjs'));
  return at;
}

function run(dir, { cwd = dir, env = {} } = {}) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

async function inTmp(fn) {
  const dir = tmp();
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const NOT_INSTALLED = /promptfoo is not installed in the suite .*: install promptfoo 0\.124\.1 in the suite/;

test('capped.js and judge.js load the ESM entry of the promptfoo in the current project, not the kit\'s own', () => inTmp((dir) => {
  fakePromptfoo(path.join(dir, 'node_modules', 'promptfoo'), { '.': { import: './esm.mjs', require: './cjs.cjs' } });
  assert.deepEqual(run(dir), { capped: 'suite-esm', judge: 'PASS: suite-esm' });
}));

test('capped.js and judge.js say to install promptfoo in the suite when it is missing', () => inTmp((dir) => {
  const { capped, judge } = run(dir);
  for (const m of [capped, judge]) assert.match(m, NOT_INSTALLED);
}));

test('a promptfoo in a parent folder is never loaded', () => inTmp((dir) => {
  fakePromptfoo(path.join(dir, 'node_modules', 'promptfoo'), { '.': { import: './esm.mjs' } }, 'planted');
  const suite = path.join(dir, 'home', 'suite');
  fs.mkdirSync(suite, { recursive: true });
  for (const m of Object.values(run(suite))) assert.match(m, NOT_INSTALLED);
}));

test('EVAL_KIT_SUITE_DIR names the suite, not the current folder', () => inTmp((dir) => {
  fakePromptfoo(path.join(dir, 'suite', 'node_modules', 'promptfoo'), { '.': { import: './esm.mjs' } });
  fakePromptfoo(path.join(dir, 'other', 'node_modules', 'promptfoo'), { '.': { import: './esm.mjs' } }, 'other');
  assert.equal(run(path.join(dir, 'other'), { env: { EVAL_KIT_SUITE_DIR: path.join(dir, 'suite') } }).capped, 'suite-esm');
}));

test('the ESM entry comes from every exports shape, and a linked package loads from its real folder', async () => {
  const shapes = ['./esm.mjs', { import: './esm.mjs', require: './cjs.cjs' }, { '.': './esm.mjs' }, { '.': { import: { types: './x.d.ts', default: './esm.mjs' }, require: './cjs.cjs' } }, undefined];
  for (const exports of shapes) {
    await inTmp(async (dir) => {
      const pkg = fakePromptfoo(path.join(dir, 'node_modules', 'promptfoo'), exports);
      if (exports === undefined) fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'promptfoo', main: './esm.mjs' }));
      const out = await (await loadPromptfoo(dir)).loadApiProvider('agent');
      assert.equal((await out.callApi()).output, 'suite-esm', JSON.stringify(exports));
    });
  }
  await inTmp(async (dir) => {
    const store = fakePromptfoo(path.join(dir, 'node_modules', '.pnpm', 'promptfoo@0.0.0', 'node_modules', 'promptfoo'), { '.': { import: './esm.mjs' } });
    const suite = path.join(dir, 'suite');
    fs.mkdirSync(path.join(suite, 'node_modules'), { recursive: true });
    fs.symlinkSync(store, path.join(suite, 'node_modules', 'promptfoo'));
    assert.equal(typeof (await loadPromptfoo(suite)).loadApiProvider, 'function');
  });
});

test('an entry outside the package folder is refused', async () => {
  await inTmp(async (dir) => {
    fs.writeFileSync(path.join(dir, 'evil.mjs'), 'export const loadApiProvider = 1;');
    fakePromptfoo(path.join(dir, 'node_modules', 'promptfoo'), { '.': { import: '../../evil.mjs' } });
    await assert.rejects(loadPromptfoo(dir), /entry .* is outside/);
  });
  await inTmp(async (dir) => {
    const pkg = fakePromptfoo(path.join(dir, 'node_modules', 'promptfoo'), { '.': { import: './link.mjs' } });
    fs.writeFileSync(path.join(dir, 'evil.mjs'), 'export const loadApiProvider = 1;');
    fs.symlinkSync(path.join(dir, 'evil.mjs'), path.join(pkg, 'link.mjs'));
    await assert.rejects(loadPromptfoo(dir), /entry .* is outside/);
  });
});

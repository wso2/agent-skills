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

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TESTED } from '../src/tested.mjs';

const ESM = ['import', 'node', 'default'];
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function esmEntry(pkg) {
  let e = pkg.exports;
  if (isObject(e) && Object.keys(e).some((k) => k.startsWith('.'))) e = e['.'];
  while (isObject(e)) e = e[ESM.find((c) => e[c] !== undefined)];
  return typeof e === 'string' ? e : pkg.main ?? 'index.js';
}

const inside = (root, p) => {
  const rel = path.relative(root, p);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};

// Only <suite>/node_modules/promptfoo, as an ESM import, so this shares one module instance with the running promptfoo CLI.
export async function loadPromptfoo(dir = process.env.EVAL_KIT_SUITE_DIR || process.cwd()) {
  let pkgDir;
  try {
    pkgDir = fs.realpathSync(path.join(dir, 'node_modules', 'promptfoo'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    throw new Error(`eval-kit: promptfoo is not installed in the suite ${dir}: install promptfoo ${TESTED.promptfoo} in the suite`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const entry = fs.realpathSync(path.resolve(pkgDir, esmEntry(pkg)));
  if (!inside(pkgDir, entry)) throw new Error(`eval-kit: promptfoo entry ${entry} is outside ${pkgDir}`);
  return import(pathToFileURL(entry).href);
}

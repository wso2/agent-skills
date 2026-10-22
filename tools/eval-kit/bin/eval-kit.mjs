#!/usr/bin/env node

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

process.umask(0o077);
const [cmd, ...args] = process.argv.slice(2);

const runEval = async () => (await import('../src/run.mjs')).runEval(args);
const commands = {
  eval: runEval,
  run: runEval,
  view: async () => (await (await import('../src/promptfoo.mjs')).promptfoo(['view', '-n', ...args])).code,
  compare: async () => (await import('../src/compare.mjs')).compareMain(args),
  pin: async () => (await import('../src/compare.mjs')).pinMain(args),
  list: async () => (await import('../src/list.mjs')).listMain(args),
  show: async () => (await import('../src/show.mjs')).showMain(args),
  tools: async () => (await import('../src/tools.mjs')).toolsMain(args),
  login: async () => (await import('../src/login.mjs')).loginMain(args),
  doctor: async () => (await import('../src/doctor.mjs')).doctorMain(args),
  promptfoo: async () => {
    const { promptfoo } = await import('../src/promptfoo.mjs');
    const { loadSuite } = await import('../src/suite.mjs');
    return (await promptfoo(args, { conditions: loadSuite().conditions })).code;
  },
};

if (!commands[cmd]) {
  console.error('usage: eval-kit <eval|run|list|show|compare|pin|tools|login|doctor|view|promptfoo> [args]');
  process.exit(2);
}
try {
  process.exitCode = (await commands[cmd]()) ?? 0;
} catch (e) {
  const { redact } = await import('../src/redact.mjs');
  console.error(redact(e.message));
  process.exitCode = 2;
}

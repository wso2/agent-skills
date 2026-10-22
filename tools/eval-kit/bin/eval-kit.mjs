#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  test: async () => {
    const dir = fileURLToPath(new URL('../test/', import.meta.url));
    if (!fs.existsSync(dir)) {
      console.log('eval-kit tests ship with the source, not the package: run node --test in tools/eval-kit of wso2/agent-skills');
      return 0;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).map((f) => dir + f);
    return spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' }).status ?? 1;
  },
};

if (!commands[cmd]) {
  console.error('usage: eval-kit <eval|run|list|show|compare|pin|tools|login|doctor|view|promptfoo|test> [args]');
  process.exit(2);
}
try {
  process.exitCode = (await commands[cmd]()) ?? 0;
} catch (e) {
  const { redact } = await import('../src/redact.mjs');
  console.error(redact(e.message));
  process.exitCode = 2;
}

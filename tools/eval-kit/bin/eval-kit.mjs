#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

process.umask(0o077);
const [cmd, ...args] = process.argv.slice(2);

const commands = {
  eval: async () => (await import('../src/run.mjs')).runEval(args),
  view: async () => (await (await import('../src/promptfoo.mjs')).promptfoo(['view', '-n', ...args])).code,
  compare: async () => (await import('../src/compare.mjs')).compareMain(args),
  pin: async () => (await import('../src/compare.mjs')).pinMain(args),
  tools: async () => (await import('../src/tools.mjs')).toolsMain(args),
  login: async () => (await import('../src/login.mjs')).loginMain(args),
  promptfoo: async () => (await (await import('../src/promptfoo.mjs')).promptfoo(args)).code,
  test: async () => {
    const dir = fileURLToPath(new URL('../test/', import.meta.url));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).map((f) => dir + f);
    return spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' }).status;
  },
};

if (!commands[cmd]) {
  console.error('usage: eval-kit <eval|view|compare|pin|tools|login|test|promptfoo> [args]');
  process.exit(2);
}
try {
  process.exitCode = (await commands[cmd]()) ?? 0;
} catch (e) {
  console.error(e.message);
  process.exitCode = 2;
}

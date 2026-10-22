import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { getToken } from './login.mjs';
import { redact } from './redact.mjs';
import { readJson } from './results.mjs';
import { loadSuite, requireSuiteDir, suitePaths } from './suite.mjs';
import { listTools } from './tools.mjs';

const MIN_NODE = [22, 22, 0];
const IGNORED = ['.state/probe', '.promptfoo/probe', 'results/probe', 'suite.local.json'];

function nodeOk(version = process.versions.node) {
  const v = version.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (v[i] !== MIN_NODE[i]) return v[i] > MIN_NODE[i];
  return true;
}

export async function doctorMain(args, { dir } = {}) {
  let bad = 0;
  const ok = (m) => console.log(`ok    ${m}`);
  const warn = (m) => console.log(`warn  ${m}`);
  const fail = (m) => {
    bad += 1;
    console.log(`FAIL  ${m}`);
  };
  (nodeOk() ? ok : fail)(`node ${process.versions.node} (needs >= ${MIN_NODE.join('.')})`);
  requireSuiteDir(dir);
  const s = loadSuite(dir);
  const p = suitePaths(s.dir);
  ok(`suite: ${s.servers.length} servers, pass ${s.pass}, conditions [${s.conditions.join(', ')}], flags [${Object.keys(s.flags).join(', ')}]`);

  const peers = readJson(new URL('../package.json', import.meta.url))?.peerDependencies ?? {};
  for (const [name, want] of Object.entries(peers)) {
    const got = readJson(path.join(s.dir, 'node_modules', name, 'package.json'))?.version;
    if (!got) (name === 'promptfoo' ? fail : warn)(`${name} not installed in ${s.dir} (want ${want})`);
    else (got === want ? ok : fail)(`${name} ${got}${got === want ? '' : ` (eval-kit is tested with ${want})`}`);
  }

  try {
    const out = execFileSync('git', ['-C', s.dir, 'check-ignore', ...IGNORED], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const ignored = new Set(out.split('\n').filter(Boolean));
    const missing = IGNORED.filter((f) => !ignored.has(f)).map((f) => f.replace('/probe', '/'));
    (missing.length ? fail : ok)(missing.length ? `not git-ignored: ${missing.join(' ')}` : 'git ignores .state/ .promptfoo/ results/ suite.local.json');
  } catch (e) {
    if (e.status === 1) fail('not git-ignored: .state/ .promptfoo/ results/ suite.local.json');
    else warn('not in a git work tree; keep .state/ .promptfoo/ results/ suite.local.json private');
  }

  if (process.env.ANTHROPIC_API_KEY) warn('ANTHROPIC_API_KEY is set in this shell; eval-kit does not pass it to promptfoo, so runs use your Claude login');

  for (const server of s.servers) {
    try {
      const { token, expiresAt } = await getToken(server, { browser: false, stateDir: p.state });
      const tools = await listTools(server.url, token);
      ok(`${server.name}: signed in (expires in ${expiresAt - Math.floor(Date.now() / 1000)} s), ${tools.length} tools at ${server.url}`);
    } catch (e) {
      fail(`${server.name}: ${redact(e.message)}`);
    }
  }
  return bad ? 3 : 0;
}

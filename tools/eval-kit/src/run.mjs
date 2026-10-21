import fs from 'node:fs';
import path from 'node:path';
import { caseLine, passes, summarize } from './compare.mjs';
import { getToken } from './login.mjs';
import { promptfoo, promptfooEnv } from './promptfoo.mjs';
import { loadSuite, RESULTS_DIR } from './suite.mjs';
import { listTools, writeSnapshot } from './tools.mjs';

export async function runEval(args) {
  const s = loadSuite();
  const extra = {};
  let tools;
  if (s.url) {
    try {
      const token = (await getToken({ url: s.authFrom, clientId: s.clientId, callbackPort: s.callbackPort, minTtl: 1800 })).accessToken;
      tools = await listTools(s.url, token);
      Object.assign(extra, { [`${s.env}_URL`]: s.url, [`${s.env}_TOKEN`]: token });
    } catch (e) {
      console.error(`preflight: ${e.message}`);
      return 3;
    }
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true, mode: 0o700 });
  const out = path.join(RESULTS_DIR, `.run-${process.pid}.json`);
  const repeat = args.includes('--repeat') ? [] : ['--repeat', '3'];
  const { code } = await promptfoo(['eval', '-c', 'promptfooconfig.yaml', '--no-cache', '--no-share', ...repeat, '-o', out, ...args], { env: promptfooEnv(extra) });
  if (!fs.existsSync(out)) return code || 2;

  const exp = JSON.parse(fs.readFileSync(out, 'utf8'));
  const dir = path.join(RESULTS_DIR, exp.evalId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.renameSync(out, path.join(dir, 'eval.json'));
  if (tools) writeSnapshot(path.join(dir, 'tools.json'), tools);

  const { cases } = summarize(exp);
  for (const [name, c] of cases) console.log(caseLine(name, c));
  const ok = [...cases.values()].filter(passes).length;
  console.log(`${exp.evalId}: ${ok}/${cases.size} cases pass (2 of 3 runs)`);
  return ok === cases.size ? 0 : 1;
}

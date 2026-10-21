import fs from 'node:fs';
import path from 'node:path';

export const SUITE_DIR = process.cwd();
export const RESULTS_DIR = path.join(SUITE_DIR, 'results');
export const PROMPTFOO_DIR = path.join(SUITE_DIR, '.promptfoo');
export const STATE_DIR = path.join(SUITE_DIR, '.state');

export function loadSuite(env = process.env) {
  if (!fs.existsSync(path.join(SUITE_DIR, 'promptfooconfig.yaml'))) throw new Error(`no promptfooconfig.yaml in ${SUITE_DIR}: run from the suite directory`);
  const file = path.join(SUITE_DIR, 'suite.json');
  const s = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const url = env.MCP_URL || s.url;
  return { ...s, url, authFrom: env.MCP_AUTH_FROM || s.authFrom || url };
}

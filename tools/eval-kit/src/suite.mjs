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
  const port = s.callbackPort;
  if (url && !(/^[A-Za-z_]\w*$/.test(s.env ?? '') && s.clientId && Number.isInteger(port) && port > 0 && port < 65536)) {
    throw new Error(`${file} needs env (a variable prefix), clientId and callbackPort (1-65535) to test ${url}`);
  }
  return { ...s, url, authFrom: env.MCP_AUTH_FROM || s.authFrom || url };
}

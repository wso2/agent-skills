export interface SuiteServer {
  name: string;
  env?: string;
  clientId: string;
  callbackPort: number;
  url: string;
  authFrom: string;
  origin: 'suite.json' | 'suite.local.json' | 'MCP_URL';
}

export interface SuiteFlag {
  env: string;
  value?: string;
}

export interface Suite {
  servers: SuiteServer[];
  conditions: string[];
  flags: Record<string, SuiteFlag>;
  pass: '2of3' | 'all';
  budgetUsd?: number;
  gitScope?: string;
  origins: Record<string, 'suite.json' | 'suite.local.json'>;
  dir: string;
  [key: string]: unknown;
}

export class SuiteError extends Error {}
export function loadSuite(dir?: string, env?: Record<string, string | undefined>): Suite;
export function suitePaths(dir?: string): { dir: string; results: string; promptfoo: string; state: string };

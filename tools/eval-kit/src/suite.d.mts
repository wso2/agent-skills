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

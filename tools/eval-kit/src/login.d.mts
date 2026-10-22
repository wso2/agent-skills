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

export interface Server {
  name?: string;
  url: string;
  authFrom?: string;
  clientId: string;
  callbackPort: number;
}

export interface TokenOptions {
  browser?: boolean;
  openUrl?: ((url: string) => void) | null;
  minTtl?: number;
  force?: boolean;
  stateDir?: string;
}

export interface Token {
  token: string;
  expiresAt: number;
  via: 'cache' | 'refresh' | 'browser';
}

export class LoginError extends Error {
  step: string;
}

export function getToken(server: Server, options?: TokenOptions): Promise<Token>;
export function checkUrl(url: string, step?: string): URL;
export function statePath(url: string, clientId: string, stateDir?: string): string;
export function logout(server: Server, stateDir?: string): void;
export function logoutAll(stateDir?: string): number;
export function loginMain(args: string[], options?: { dir?: string }): Promise<number>;

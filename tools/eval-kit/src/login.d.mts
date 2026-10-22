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

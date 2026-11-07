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

const SCOPE_TOKEN = '[\\x21\\x23-\\x5B\\x5D-\\x7E]+';
const SCOPE = new RegExp(`^${SCOPE_TOKEN}( ${SCOPE_TOKEN})*$`);
const URI = /^[A-Za-z][A-Za-z0-9+.-]*:[A-Za-z0-9._~:/?[\]@!$&'()*+,;=%-]+$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost|(.+\.)?127\.0\.0\.1\.(nip|sslip)\.io)$/;

export class LoginError extends Error {
  constructor(step, message) {
    super(`${step}: ${message}`);
    this.step = step;
  }
}

export function checkUrl(url, step = 'url') {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new LoginError(step, `not a URL: ${url}`);
  }
  if (u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOST.test(u.hostname.toLowerCase()))) return u;
  throw new LoginError(step, `use https, or http only for a local host: ${url}`);
}

export function checkResource(resource, scope, step = 'resource') {
  if (resource === undefined) {
    if (scope !== undefined) throw new LoginError(step, 'scope is set but resource is not');
    return;
  }
  if (typeof resource !== 'string' || !URI.test(resource) || !URL.canParse(resource)) {
    throw new LoginError(step, `resource must be an absolute URI without a fragment: ${resource}`);
  }
  if (scope !== undefined && (typeof scope !== 'string' || !SCOPE.test(scope))) throw new LoginError(step, `scope must be scope tokens separated by one space: ${scope}`);
}

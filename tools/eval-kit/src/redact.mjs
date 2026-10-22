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

const JWT = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;
const BEARER = /\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
const TOKEN_FIELD = /("?(?:access|refresh|id)_?token"?\s*[:=]\s*"?)[A-Za-z0-9._~+/=-]{8,}/gi;

export function redact(value) {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  return text.replace(JWT, '[REDACTED-JWT]').replace(BEARER, '$1[REDACTED]').replace(TOKEN_FIELD, '$1[REDACTED]');
}

export function clip(value, limit, full = false) {
  const text = redact(value);
  return full || text.length <= limit ? text : `${text.slice(0, limit)}... [${text.length - limit} more]`;
}

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

import http from 'node:http';
import net from 'node:net';

const LOOPBACK = '127.0.0.1';
const WILDCARD = new Set([undefined, null, '', '0.0.0.0', '::']);
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const isPort = (v) => typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v));

const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const [a] = args;
  if (a === undefined || typeof a === 'function') args.unshift(0, LOOPBACK);
  else if (isPort(a)) {
    if (typeof args[1] !== 'string') args.splice(1, 0, LOOPBACK);
    else if (WILDCARD.has(args[1])) args[1] = LOOPBACK;
  } else if (a && typeof a === 'object' && a.path === undefined && a.fd === undefined && a.handle === undefined && a._handle === undefined && WILDCARD.has(a.host)) {
    args[0] = { ...a, host: LOOPBACK };
  }
  return listen.apply(this, args);
};

// promptfoo's viewer allows any CORS origin, so a loopback bind alone does not stop a web page or a DNS-rebound host from reading it.
const local = (req) => LOCAL.test(req.headers.host ?? '') && (req.headers.origin === undefined || LOCAL.test(req.headers.origin.replace(/^https?:\/\//i, '')));
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, req, out, ...rest) {
  if ((event === 'request' || event === 'upgrade') && !local(req)) {
    if (event === 'request') out.writeHead(403).end();
    else out.destroy();
    return true;
  }
  return emit.call(this, event, req, out, ...rest);
};

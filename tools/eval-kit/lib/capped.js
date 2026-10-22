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

import { add, exhausted, limit, refuse } from './budget.js';

export default class CappedProvider {
  constructor(options = {}) {
    this.options = options;
    this.label = options.label;
    this.config = options.config ?? {};
    this.handlesOwnRetries = true;
    if (!this.config.target) throw new Error('capped.js needs config.target');
    limit();
  }

  id() {
    return this.label ?? this.options.label ?? 'capped';
  }

  target() {
    const { target, judge, ...config } = this.config;
    const { env } = this.options;
    this.loading ??= import('promptfoo')
      .then(({ loadApiProvider }) => loadApiProvider(target, { env, basePath: config.basePath, options: { config, env } }))
      .catch((e) => {
        this.loading = undefined;
        throw e;
      });
    return this.loading;
  }

  async callApi(prompt, context, callOptions) {
    if (!this.config.judge && exhausted()) return { error: refuse() };
    const response = await (await this.target()).callApi(prompt, context, callOptions);
    add(response?.cost);
    return response;
  }

  async cleanup() {
    const inner = await this.loading?.catch(() => undefined);
    await inner?.cleanup?.();
  }
}

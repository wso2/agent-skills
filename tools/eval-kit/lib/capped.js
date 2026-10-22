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

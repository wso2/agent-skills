import { loadApiProvider } from 'promptfoo';

const RAW_LIMIT = process.env.EVAL_BUDGET_USD;
const LIMIT = RAW_LIMIT === undefined || RAW_LIMIT === '' ? 2 : Number(RAW_LIMIT);
if (!Number.isFinite(LIMIT) || LIMIT < 0) throw new Error(`EVAL_BUDGET_USD must be a non-negative number, got ${RAW_LIMIT}`);
let spent = 0;
process.on('exit', () => console.error(`spent $${spent.toFixed(3)} of $${LIMIT} (agent and judge)`));

export default class CappedProvider {
  constructor(options) {
    this.options = options;
    this.label = options.label;
  }

  id() {
    return this.options.label ?? 'capped';
  }

  target() {
    const { target, judge, ...config } = this.options.config;
    const { env } = this.options;
    this.loading ??= loadApiProvider(target, { env, options: { config, env } }).catch((e) => {
      this.loading = undefined;
      throw e;
    });
    return this.loading;
  }

  async callApi(prompt, context, callOptions) {
    if (spent >= LIMIT) {
      const error = `eval budget $${LIMIT} reached ($${spent.toFixed(3)} spent)`;
      if (this.options.config.judge) throw new Error(error);
      return { error };
    }
    const response = await (await this.target()).callApi(prompt, context, callOptions);
    spent += response.cost ?? 0;
    return response;
  }

  async cleanup() {
    const inner = await this.loading?.catch(() => undefined);
    await inner?.cleanup?.();
  }
}

import { loadApiProvider } from 'promptfoo';

const LIMIT = Number(process.env.EVAL_BUDGET_USD ?? 2);
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

  async callApi(prompt, context, callOptions) {
    const { target, judge, ...config } = this.options.config;
    if (spent >= LIMIT) {
      const error = `eval budget $${LIMIT} reached ($${spent.toFixed(3)} spent)`;
      if (judge) throw new Error(error);
      return { error };
    }
    this.inner ??= await loadApiProvider(target, { options: { config } });
    const response = await this.inner.callApi(prompt, context, callOptions);
    spent += response.cost ?? 0;
    return response;
  }
}

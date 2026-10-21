const calls = (context) => context.metadata?.toolCalls ?? [];
const mcpCalls = (context) => calls(context).filter((c) => c.name.startsWith('mcp__'));
const short = (name) => name.split('__').pop();

export function calledAnyOf(output, context) {
  const want = context.config?.tools ?? [];
  const names = mcpCalls(context).map((c) => short(c.name));
  const pass = names.some((n) => want.includes(n));
  return { pass, score: pass ? 1 : 0, reason: `wanted one of ${want.join(', ')}; called ${names.join(', ') || 'nothing'}` };
}

export const replyWithToolResults = (output, context) =>
  JSON.stringify({
    reply: output,
    toolResults: mcpCalls(context).map((c) => ({ tool: short(c.name), input: c.input, isError: c.is_error, output: c.output })),
  });

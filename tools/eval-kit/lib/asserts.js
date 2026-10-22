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

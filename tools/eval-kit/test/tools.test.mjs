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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, diffTools } from '../src/tools.mjs';

const before = canonical([
  { name: 'list_projects', description: 'Lists projects.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_agents', description: 'Lists agents.', inputSchema: { type: 'object', required: ['project'], properties: { project: { type: 'string' } } } },
]);

test('canonical sorts tools and keys', () => {
  assert.deepEqual(before.map((t) => t.name), ['list_agents', 'list_projects']);
  assert.deepEqual(Object.keys(before[0]), ['description', 'inputSchema', 'name']);
});

test('diff reports fields, added and removed tools', () => {
  const after = canonical([
    { name: 'list_agents', description: 'Lists agents of one project.', inputSchema: { type: 'object', required: ['project', 'org'], properties: { project: { type: 'string' }, org: { type: 'string' } } } },
    { name: 'get_agent', description: 'Gets an agent.', inputSchema: { type: 'object' } },
  ]);
  assert.deepEqual(diffTools(before, after), [
    '+ get_agent',
    '~ list_agents.description: "Lists agents." -> "Lists agents of one project."',
    '+ list_agents.inputSchema.properties.org: {"type":"string"}',
    '~ list_agents.inputSchema.required: ["project"] -> ["project","org"]',
    '- list_projects',
  ]);
  assert.deepEqual(diffTools(before, before), []);
});

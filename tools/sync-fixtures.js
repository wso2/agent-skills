#!/usr/bin/env node

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

/**
 * Copy the live skill into a skill's eval fixture workspace.
 *
 *   node tools/sync-fixtures.js <plugin> <skill>   # sync one skill
 *   node tools/sync-fixtures.js --all              # sync every skill that has evals/
 *
 * The copies are generated, never committed: anything under a skill's directory
 * is installed with the skill, so a committed copy would ship a second SKILL.md
 * to every user. Each suite's `npm run eval` runs this first, and the suite's
 * .gitignore excludes the copies. They are real files, not symlinks, because
 * Codex's scanner needs real files under .agents/skills/.
 *
 * Node builtins only — no dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKILL_PARTS = ['SKILL.md', 'references', 'scripts', 'assets'];
// Provider id in a suite's promptfooconfig*.yaml -> the directory that agent
// scans for skills. A grader-only provider also gets a copy; it is unused but
// harmless.
const LAYOUTS = [
  ['anthropic:claude-agent-sdk', '.claude'],
  ['openai:codex-sdk', '.agents'],
];

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

/** Copy SKILL.md + sibling dirs into the layout of each provider the suite uses. Returns count. */
function syncSkill(plugin, skill) {
  const skillDir = path.join(REPO_ROOT, 'plugins', plugin, 'skills', skill);
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    // Warn and skip rather than fail() so a bad entry doesn't abort a --all run.
    console.warn(`  (skip) ${plugin}/${skill}: no SKILL.md at plugins/${plugin}/skills/${skill}`);
    return 0;
  }
  const evalsDir = path.join(skillDir, 'evals');
  const configs = fs.existsSync(evalsDir)
    ? fs.readdirSync(evalsDir)
      .filter((f) => /^promptfooconfig.*\.ya?ml$/.test(f))
      .map((f) => fs.readFileSync(path.join(evalsDir, f), 'utf8'))
      .join('\n')
    : '';
  const layouts = LAYOUTS
    .filter(([id]) => configs.includes(id))
    .map(([, dir]) => path.join(evalsDir, 'fixtures', 'workspace', dir, 'skills', skill));

  if (!layouts.length) {
    console.warn(`  (skip) ${plugin}/${skill}: no known provider (${LAYOUTS.map(([id]) => id).join(', ')}) in evals/promptfooconfig*.yaml`);
    return 0;
  }
  for (const dest of layouts) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const part of SKILL_PARTS) {
      const src = path.join(skillDir, part);
      if (fs.existsSync(src)) {
        fs.cpSync(src, path.join(dest, part), { recursive: true, dereference: true });
      }
    }
    console.log(`  synced -> ${path.relative(REPO_ROOT, dest)}`);
  }
  return layouts.length;
}

/** Find every plugins/<plugin>/skills/<skill> that has an evals/ dir. */
function findSkillsWithEvals() {
  const out = [];
  const pluginsDir = path.join(REPO_ROOT, 'plugins');
  for (const plugin of fs.readdirSync(pluginsDir)) {
    const skillsDir = path.join(pluginsDir, plugin, 'skills');
    if (!fs.existsSync(skillsDir)) continue;
    for (const skill of fs.readdirSync(skillsDir)) {
      if (fs.existsSync(path.join(skillsDir, skill, 'evals'))) {
        out.push({ plugin, skill });
      }
    }
  }
  return out;
}

// ---- main -----------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv[0] === '--all') {
  const skills = findSkillsWithEvals();
  if (!skills.length) fail('no skills with an evals/ directory found');
  let total = 0;
  for (const { plugin, skill } of skills) {
    console.log(`${plugin}/${skill}:`);
    total += syncSkill(plugin, skill);
  }
  console.log(`done — refreshed ${total} fixture layout(s) across ${skills.length} skill(s)`);
} else {
  const [plugin, skill] = argv;
  if (!plugin || !skill) {
    fail('usage: node tools/sync-fixtures.js <plugin> <skill>   |   --all');
  }
  // plugin/skill become path segments below — keep them to plain directory names.
  if (!/^[\w-]+$/.test(plugin) || !/^[\w-]+$/.test(skill)) {
    fail('plugin and skill must contain only letters, digits, dashes, or underscores');
  }
  console.log(`${plugin}/${skill}:`);
  // Fail when nothing was copied, so `npm run eval` stops instead of running
  // promptfoo against a fixture workspace with no skill in it.
  if (!syncSkill(plugin, skill)) process.exit(1);
}

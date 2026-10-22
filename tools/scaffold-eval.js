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
 * Scaffold a promptfoo eval suite for a skill.
 *
 *   node tools/scaffold-eval.js <plugin> <skill> [options]
 *
 * Options:
 *   --providers <list>   Comma-separated agent providers to evaluate under,
 *                        e.g. "claude" or "claude,codex" (default: claude).
 *                        Known providers: see PROVIDERS below.
 *   --grader <provider>  Provider for model-graded (llm-rubric) assertions,
 *                        e.g. "claude" (default) or "codex". Kept to one
 *                        provider so scores stay comparable across runs.
 *   --model <id>         Model id override (applied to every selected provider)
 *   --force              Overwrite an existing evals/ directory
 *
 * Generates plugins/<plugin>/skills/<skill>/evals/ with a promptfooconfig.yaml,
 * starter tests, package.json (whose `npm run eval` copies the skill into the
 * fixture workspace first), a .gitignore that keeps those copies out of git,
 * and a README. Fill in the TODOs in tests/ and run `npm run eval`. See
 * EVALS.md for the full guide.
 *
 * Node builtins only — no dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// ---- provider registry ----------------------------------------------------
// Adding a new agent provider = one entry here.
//   layout      fixture discovery path the agent scans
//   dep         [packageName, version] SDK to install
//   defaultModel model id used when --model isn't given
//   block       provider-under-test YAML block (runs the skill)
//   graderBlock grader YAML block for defaultTest.options.provider (no skill —
//               just produces the rubric verdict); used when this provider is
//               picked as --grader.
const PROVIDERS = {
  claude: {
    layout: (skill) => `.claude/skills/${skill}`,
    dep: ['@anthropic-ai/claude-agent-sdk', '^0.3.195'],
    defaultModel: 'claude-sonnet-4-6',
    block: (skill, model) => `  - id: anthropic:claude-agent-sdk
    label: ${skill}
    config:
      model: ${model}
      apiKeyRequired: false        # reuse the Claude Code login; no API key needed
      working_dir: ./fixtures/workspace
      setting_sources: ["project"] # discover .claude/skills/
      skills: ["${skill}"]   # also auto-allows the Skill tool (SDK >= 0.2.120)
      # Read/Grep/Glob let the skill read its references and any sample files.
      # Add Write/Edit only if a test needs file edits.
      append_allowed_tools: ["Read", "Grep", "Glob"]`,
    graderBlock: (model) => `      id: anthropic:claude-agent-sdk
      label: grader
      config:
        model: ${model}
        apiKeyRequired: false`,
  },
  codex: {
    layout: (skill) => `.agents/skills/${skill}`,
    dep: ['@openai/codex-sdk', '^0.142.4'],
    defaultModel: 'gpt-5.5',
    block: (skill, model) => `  - id: openai:codex-sdk
    label: ${skill}-codex
    config:
      model: ${model}
      working_dir: ./fixtures/workspace   # Codex discovers .agents/skills/
      sandbox_mode: read-only             # raise to workspace-write if a test edits files
      skip_git_repo_check: true
      enable_streaming: true              # capture Codex steps as spans`,
    graderBlock: (model) => `      id: openai:codex-sdk
      label: grader
      config:
        model: ${model}
        sandbox_mode: read-only
        skip_git_repo_check: true`,
  },
};
const PROVIDER_KEYS = Object.keys(PROVIDERS);
const DEFAULT_GRADER = 'claude';

// ---- parse args -----------------------------------------------------------
const argv = process.argv.slice(2);
const positional = [];
const opts = { providers: 'claude', grader: DEFAULT_GRADER, model: '', force: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--force') opts.force = true;
  else if (a === '--providers') opts.providers = argv[++i];
  else if (a === '--grader') opts.grader = argv[++i];
  else if (a === '--model') opts.model = argv[++i];
  else if (a.startsWith('--')) fail(`unknown option: ${a}`);
  else positional.push(a);
}
const [plugin, skill] = positional;
const USAGE = `usage: node tools/scaffold-eval.js <plugin> <skill> [--providers ${PROVIDER_KEYS.join('|')}[,...]] [--grader ${PROVIDER_KEYS.join('|')}] [--model <id>] [--force]`;
if (!plugin || !skill) fail(USAGE);
// plugin/skill become path segments below — keep them to plain directory names.
if (!/^[\w-]+$/.test(plugin) || !/^[\w-]+$/.test(skill)) {
  fail('plugin and skill must contain only letters, digits, dashes, or underscores');
}

// Parse the comma-separated provider list: trim, drop blanks, dedupe, keep order.
const selected = [...new Set(
  (opts.providers || '').split(',').map((p) => p.trim()).filter(Boolean),
)];
if (!selected.length) fail('--providers must name at least one provider');
const unknown = selected.filter((p) => !PROVIDERS[p]);
if (unknown.length) {
  fail(`unknown provider(s): ${unknown.join(', ')} — known: ${PROVIDER_KEYS.join(', ')}`);
}

// Grader: one provider, defaults to claude. A fixed grader keeps scores
// comparable across the providers-under-test, but it's overridable so a
// codex-only run need not depend on Claude.
const grader = (opts.grader || '').trim();
if (!PROVIDERS[grader]) {
  fail(`--grader must be one of: ${PROVIDER_KEYS.join(', ')} (got "${opts.grader}")`);
}

// ---- resolve paths --------------------------------------------------------
const skillDir = path.join(REPO_ROOT, 'plugins', plugin, 'skills', skill);
if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
  fail(`no SKILL.md at ${path.relative(REPO_ROOT, skillDir)} — check <plugin>/<skill>`);
}
const evalsDir = path.join(skillDir, 'evals');
if (fs.existsSync(evalsDir) && !opts.force) {
  fail(`${path.relative(REPO_ROOT, evalsDir)} already exists (use --force to overwrite)`);
}

// Grader model: the grader provider's default (the --model override applies to
// providers-under-test, not the grader).
const graderModel = PROVIDERS[grader].defaultModel;

// ---- helpers --------------------------------------------------------------
function write(rel, contents) {
  const full = path.join(evalsDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

// ---- derive everything from the selected providers ------------------------
const fixtureLayouts = selected.map((p) => PROVIDERS[p].layout(skill));
const providerBlocks = selected.map((p) =>
  PROVIDERS[p].block(skill, opts.model || PROVIDERS[p].defaultModel));

// ---- promptfooconfig.yaml -------------------------------------------------
write('promptfooconfig.yaml', `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

# Eval suite for the "${skill}" skill. The agent SDK discovers it from the
# fixture workspace and runs it as a real skill (see EVALS.md at the repo root).
#
# Run from this directory:
#   npm install
#   npm run eval    # copies the live skill into fixtures/workspace, then runs promptfoo
#   npm run view
#
# Requires Node >= 22.22 and provider auth: run \`claude\` once (Claude) and/or
# \`codex\` once (Codex — logs in via your ChatGPT account). No API key is needed
# locally; set ANTHROPIC_API_KEY / OPENAI_API_KEY only where no login exists (CI).

description: "${skill} skill evals"

# Built-in OTel tracing (no external collector). View per-result under the 🔎
# icon -> Trace Timeline. Tool calls are in each result's Metadata, not spans.
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
      host: 127.0.0.1
      acceptFormats: ["json", "protobuf"]

prompts:
  - "{{request}}"

providers:
${providerBlocks.join('\n\n')}

defaultTest:
  options:
    disableVarExpansion: true
    # Grader for model-graded (llm-rubric) assertions. Keep it fixed (one
    # provider) so scores stay comparable across the providers-under-test.
    # Default is ${grader}; re-scaffold with --grader to change it.
    provider:
${PROVIDERS[grader].graderBlock(graderModel)}
  # NOTE: skill-used is asserted per-test (not here), so boundary/negative tests
  # can assert not-skill-used. See tests/.

tests:
  - file://tests/triggering.yaml
  - file://tests/task-quality.yaml
`);

// ---- starter tests --------------------------------------------------------
write('tests/triggering.yaml', `# Triggering / routing tests — does the skill activate on the right prompts and
# open with the right behavior, and stay out of the way on the wrong ones?

- description: "TODO: a prompt that SHOULD activate ${skill}"
  vars:
    request: "TODO: a user message that should trigger the skill"
  assert:
    - type: skill-used
      value: ${skill}
    - type: llm-rubric
      value: >-
        TODO: describe the correct first-turn behavior (e.g. asks the right
        clarifying question; does not jump ahead; routes to the right workflow).

# Boundary case — should NOT activate ${skill} (e.g. belongs to a sibling skill).
- description: "TODO: a prompt that should NOT activate ${skill}"
  vars:
    request: "TODO: a message outside this skill's scope"
  assert:
    - type: not-skill-used
      value: ${skill}
`);

write('tests/task-quality.yaml', `# Core task-quality tests — given a representative request, does the skill
# produce a correct result? Deterministic checks first, one rubric for the
# holistic call.

- description: "TODO: ${skill} produces a correct result for a representative input"
  vars:
    request: "TODO: a complete request that exercises the skill's main workflow"
  # If the skill wraps output in markdown code fences, strip them first:
  # options:
  #   transform: "output.replace(/\\\`\\\`\\\`[a-z]*\\\\n?/gi,'').replace(/\\\`\\\`\\\`/g,'').trim()"
  assert:
    - type: skill-used
      value: ${skill}
    # Deterministic checks (contains / regex / is-json / javascript) — prefer these.
    # Full prebuilt list: https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/
    - type: contains
      value: "TODO"
    # One model-graded holistic check:
    - type: llm-rubric
      value: >-
        TODO: describe what a high-quality result must contain. Be specific and
        list the must-haves so the grader can check each one.
      threshold: 0.7
`);

// ---- package.json ---------------------------------------------------------
// One dep per selected provider, plus the grader provider's SDK (deduped, so
// no extra dep when the grader is also a provider-under-test).
const deps = {};
for (const p of [...selected, grader]) {
  const [name, version] = PROVIDERS[p].dep;
  deps[name] = version;
}
// The skill copies in the fixture workspace are generated, so every run syncs
// first with the central tools/sync-fixtures.js (single source of truth).
write('package.json', JSON.stringify({
  name: `${skill}-evals`,
  private: true,
  description: `Promptfoo eval suite for the ${skill} skill.`,
  scripts: {
    sync: `node ../../../../../tools/sync-fixtures.js ${plugin} ${skill}`,
    eval: 'npm run -s sync && npx promptfoo@latest eval -c promptfooconfig.yaml -o output.json --no-cache --no-share',
    view: 'npx promptfoo@latest view',
  },
  dependencies: deps,
}, null, 2) + '\n');

// ---- .gitignore -----------------------------------------------------------
// Skill copies are generated by \`npm run eval\`. Never commit them: anything
// under the skill's directory is installed with the skill. Ignore every layout,
// not just the selected ones: sync-fixtures.js also copies for the grader's
// provider and for any provider added to the config later.
write('.gitignore', `node_modules/
output.json
.promptfoo/
fixtures/workspace/api-reports/
${PROVIDER_KEYS.map((p) => `fixtures/workspace/${PROVIDERS[p].layout(skill)}/`).join('\n')}
`);

// ---- README ---------------------------------------------------------------
write('README.md', `# ${skill} — promptfoo evals

Evaluates the \`${skill}\` skill as a real agent skill discovered from the fixture
workspace. See [EVALS.md](../../../../../EVALS.md) at the repo root for the full guide.

## Run

\`\`\`bash
npm install                      # installs the agent SDK(s)
# log in once (no API key needed locally):
#   claude        (Claude)   /   codex        (Codex)
npm run eval                     # copies the live skill into the fixtures, then runs promptfoo
npm run view
\`\`\`

Pass extra promptfoo flags after \`--\`, e.g. \`npm run eval -- --filter-pattern "T1"\`.

Requires Node >= 22.22.

## Fixtures

\`npm run eval\` copies the live skill into
${fixtureLayouts.map((l) => `\`fixtures/workspace/${l}\``).join(' and ')} before every run.
Those copies are gitignored; do not commit them. Commit only what the tests need around the
skill: sample projects and stubs.

## What to fill in

\`tests/triggering.yaml\` and \`tests/task-quality.yaml\` ship with TODOs — replace
them with real cases for this skill (a positive trigger, a boundary/negative
case, and a representative task with deterministic checks + one rubric).
`);

// ---- done -----------------------------------------------------------------
const rel = path.relative(REPO_ROOT, evalsDir);
console.log(`scaffolded ${rel}/`);
console.log(`  providers: ${selected.join(', ')}`);
console.log(`  grader:    ${grader}`);
console.log(`  fixtures:  ${fixtureLayouts.join(', ')}  (copied by npm run eval, gitignored)`);
console.log('next:');
console.log(`  1. cd ${rel} && npm install`);
console.log('  2. fill in tests/triggering.yaml and tests/task-quality.yaml');
console.log('  3. npm run eval');

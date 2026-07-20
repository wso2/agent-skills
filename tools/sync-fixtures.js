#!/usr/bin/env node
/**
 * Refresh the skill copies in a skill's eval fixture workspace from the real skill.
 *
 *   node tools/sync-fixtures.js <plugin> <skill>   # sync one skill
 *   node tools/sync-fixtures.js --all              # sync every skill that has evals/
 *
 * Eval fixtures hold real COPIES (not symlinks) of the skill: Codex's scanner
 * needs real files under .agents/skills/, and copies keep the eval independent
 * of the live skill. Run this after editing a skill so its fixtures stay in sync.
 *
 * Node builtins only — no dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKILL_PARTS = ['SKILL.md', 'references', 'scripts', 'assets'];

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

/** Copy SKILL.md + sibling dirs into each fixture layout that exists. Returns count. */
function syncSkill(plugin, skill) {
  const skillDir = path.join(REPO_ROOT, 'plugins', plugin, 'skills', skill);
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    // Warn and skip rather than fail() so a bad entry doesn't abort a --all run.
    console.warn(`  (skip) ${plugin}/${skill}: no SKILL.md at plugins/${plugin}/skills/${skill}`);
    return 0;
  }
  const wsRoot = path.join(skillDir, 'evals', 'fixtures', 'workspace');
  const layouts = [
    path.join(wsRoot, '.claude', 'skills', skill),
    path.join(wsRoot, '.agents', 'skills', skill),
  ].filter((d) => fs.existsSync(d));

  if (!layouts.length) {
    console.warn(`  (skip) ${plugin}/${skill}: no fixture layouts under evals/fixtures/workspace`);
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
  syncSkill(plugin, skill);
}

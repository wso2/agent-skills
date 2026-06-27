#!/usr/bin/env node
// Validates skills and plugin manifests against the Agent Skills spec
// (https://agentskills.io/specification) and the documented Claude Code plugin
// rules (https://code.claude.com/docs/en/plugins-reference).
//
// Self-contained and tool-agnostic: needs only Node + the `yaml` package, so it
// runs the same in CI and locally for any contributor (Claude Code, Codex,
// Gemini, …). Manifests are plain JSON, validated with the built-in JSON parser;
// only SKILL.md frontmatter is YAML, parsed with the maintained `yaml` package
// rather than a hand-rolled parser.
//
// Run from the repo root after `npm ci`:
//   node .github/scripts/validate-skills.js
// Exits 1 if any error is found, 0 otherwise.

const { readFileSync, readdirSync, existsSync, statSync } = require("node:fs");
const { join } = require("node:path");
const YAML = require("yaml");

const ROOT = process.cwd();
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// --- Spec constants -------------------------------------------------------
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/; // lowercase kebab, no leading/trailing/double hyphen
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;
const ALLOWED_FRONTMATTER = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
  "compatibility",
]);
const NAME_MAX = 64;
const DESC_MAX = 1024;
const COMPAT_MAX = 500;
const BODY_SOFT_LIMIT = 500; // lines — spec guidance, warn only

// Extensions we treat as real file references when checking SKILL.md links.
// Longer extensions first so alternation doesn't match "js" inside "json";
// the trailing lookahead ensures the extension isn't part of a longer token.
const REF_EXT = "jsonc|json|yaml|yml|html|mjs|cjs|md|js|sh|txt|png|svg";
const REF_RE = new RegExp(`(references|scripts|assets)/[A-Za-z0-9._/-]+\\.(?:${REF_EXT})(?![A-Za-z0-9])`, "g");

// --- Helpers --------------------------------------------------------------
function dirs(p) {
  if (!existsSync(p)) return [];
  return readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory());
}

function readJson(path) {
  try {
    return { json: JSON.parse(readFileSync(path, "utf8")) };
  } catch (e) {
    return { error: e.message };
  }
}

// Extract the YAML frontmatter block and parse it with the `yaml` package.
function parseFrontmatter(content) {
  if (!content.startsWith("---")) return { error: "missing YAML frontmatter (file must start with ---)" };
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { error: "frontmatter not closed with ---" };
  let fields;
  try {
    fields = YAML.parse(m[1]);
  } catch (e) {
    return { error: `invalid YAML frontmatter: ${String(e.message).split("\n")[0]}` };
  }
  if (fields == null || typeof fields !== "object" || Array.isArray(fields)) {
    return { error: "frontmatter must be a YAML mapping of key: value" };
  }
  return { fields };
}

// --- Skill validation -----------------------------------------------------
function validateSkill(skillDir, dirName) {
  const skillFile = join(skillDir, "SKILL.md");
  const rel = `${dirName}/SKILL.md`;
  if (!existsSync(skillFile)) {
    err(rel, "missing required SKILL.md");
    return;
  }
  const content = readFileSync(skillFile, "utf8");
  const { fields, error } = parseFrontmatter(content);
  if (error) { err(rel, error); return; }

  // unknown frontmatter keys
  for (const k of Object.keys(fields)) {
    if (!ALLOWED_FRONTMATTER.has(k)) {
      err(rel, `unknown frontmatter field "${k}" (allowed: ${[...ALLOWED_FRONTMATTER].join(", ")})`);
    }
  }

  // name
  const name = fields.name;
  if (!name || typeof name !== "string") {
    err(rel, "missing required field: name");
  } else {
    if (name.length > NAME_MAX) err(rel, `name exceeds ${NAME_MAX} chars (${name.length})`);
    if (!NAME_RE.test(name)) err(rel, `name "${name}" must be lowercase kebab-case (a-z, 0-9, single hyphens)`);
    if (name !== dirName) err(rel, `name "${name}" must match its directory name "${dirName}"`);
  }

  // description
  const desc = fields.description;
  if (!desc || typeof desc !== "string" || desc.trim() === "") {
    err(rel, "missing or empty required field: description");
  } else if (desc.length > DESC_MAX) {
    err(rel, `description exceeds ${DESC_MAX} chars (${desc.length})`);
  }

  // compatibility
  if (fields.compatibility != null) {
    const c = fields.compatibility;
    if (typeof c !== "string") err(rel, "compatibility must be a string");
    else if (c.length > COMPAT_MAX) err(rel, `compatibility exceeds ${COMPAT_MAX} chars (${c.length})`);
  }

  // allowed-tools must be a scalar string
  if (fields["allowed-tools"] != null && typeof fields["allowed-tools"] !== "string") {
    err(rel, "allowed-tools must be a space-separated string");
  }

  // body size (warn only)
  const bodyLines = content.split(/\r?\n/).length;
  if (bodyLines > BODY_SOFT_LIMIT) {
    warn(rel, `SKILL.md is ${bodyLines} lines (spec guidance: keep under ${BODY_SOFT_LIMIT})`);
  }

  // referenced files exist
  const seen = new Set();
  for (const match of content.matchAll(REF_RE)) {
    const ref = match[0];
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (!existsSync(join(skillDir, ref))) {
      err(rel, `references missing file "${ref}"`);
    }
  }
}

// --- Plugin + marketplace validation --------------------------------------
function validatePlugins() {
  const pluginsRoot = join(ROOT, "plugins");
  const pluginDirs = dirs(pluginsRoot);
  const knownPlugins = new Set();

  for (const p of pluginDirs) {
    const pluginDir = join(pluginsRoot, p);
    const manifest = join(pluginDir, ".claude-plugin", "plugin.json");
    const rel = `plugins/${p}/.claude-plugin/plugin.json`;
    if (!existsSync(manifest)) {
      err(`plugins/${p}`, "missing .claude-plugin/plugin.json");
    } else {
      const { json, error } = readJson(manifest);
      if (error) {
        err(rel, `invalid JSON: ${error}`);
      } else {
        if (json.name) knownPlugins.add(json.name);
        if (!json.name) err(rel, "missing required field: name");
        else if (!NAME_RE.test(json.name)) err(rel, `name "${json.name}" must be lowercase kebab-case`);
        if (json.version && !SEMVER_RE.test(json.version)) {
          err(rel, `version "${json.version}" is not valid semver`);
        }
      }
    }

    // validate the skills in this plugin
    for (const s of dirs(join(pluginDir, "skills"))) {
      validateSkill(join(pluginDir, "skills", s), s);
    }
  }

  // marketplace.json
  const mkt = join(ROOT, ".claude-plugin", "marketplace.json");
  const mktRel = ".claude-plugin/marketplace.json";
  if (!existsSync(mkt)) {
    err(mktRel, "missing marketplace manifest");
    return;
  }
  const { json, error } = readJson(mkt);
  if (error) { err(mktRel, `invalid JSON: ${error}`); return; }
  if (!Array.isArray(json.plugins)) { err(mktRel, "missing plugins array"); return; }

  const listed = new Set();
  for (const entry of json.plugins) {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      err(mktRel, "each plugins entry must be an object");
      continue;
    }
    const hasName = typeof entry.name === "string" && entry.name.trim() !== "";
    const tag = `${mktRel} (plugin "${hasName ? entry.name : "<missing-name>"}")`;
    if (!hasName) err(tag, "missing required field: name");
    else listed.add(entry.name);
    if (!entry.source) {
      err(tag, "missing source");
    } else if (!entry.source.startsWith("./")) {
      err(tag, `source "${entry.source}" must start with "./"`);
    } else {
      const sourcePath = join(ROOT, entry.source);
      if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) {
        err(tag, `source "${entry.source}" does not resolve to a directory`);
      }
    }
    if (hasName && !knownPlugins.has(entry.name)) {
      err(tag, `not found among plugin manifests (${[...knownPlugins].join(", ") || "none"})`);
    }
  }
  // every plugin on disk should be listed in the marketplace
  for (const p of knownPlugins) {
    if (!listed.has(p)) err(mktRel, `plugin "${p}" exists on disk but is not listed in marketplace.json`);
  }
}

// --- Run ------------------------------------------------------------------
validatePlugins();

if (warnings.length) {
  console.log(`\n⚠  ${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`   - ${w}`);
}
if (errors.length) {
  console.error(`\n✗ ${errors.length} error(s):`);
  for (const e of errors) console.error(`   - ${e}`);
  console.error("\nValidation failed.");
  process.exit(1);
}
console.log(`\n✓ All skills and plugin manifests valid.`);

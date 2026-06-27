# Developer Docs

This guide covers how to contribute to the WSO2 Agent Skills monorepo — adding new plugins and testing them locally.

## Repo Layout

```
.claude-plugin/marketplace.json   — Claude Code marketplace index listing all plugins
.agents/plugins/marketplace.json  — Codex marketplace index listing all plugins
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json    — Claude Code plugin metadata (name, version, author, license)
    .codex-plugin/plugin.json     — Codex plugin metadata (same core fields + skills path + interface)
    README.md                     — plugin overview and skill list
    skills/
      <skill-name>/
        SKILL.md                  — skill definition (triggers, workflow, allowed tools)
        references/               — reference docs the skill loads on demand
        scripts/                  — helper scripts the skill invokes
```

Each plugin is packaged for both Claude Code and Codex from the same `skills/` content. The two manifests and two marketplace files must stay in sync — keep skill content platform-neutral (say "agent session", not "Claude Code session").

## Adding a New Plugin

1. **Create the plugin directory**

   ```
   plugins/<plugin-name>/
   ```

2. **Add Claude Code plugin metadata** at `plugins/<plugin-name>/.claude-plugin/plugin.json`:

   ```json
   {
     "name": "<plugin-name>",
     "version": "0.1.0",
     "description": "Short description of what the plugin does.",
     "author": { "name": "WSO2", "url": "https://wso2.com" },
     "homepage": "https://github.com/wso2/agent-skills",
     "repository": "https://github.com/wso2/agent-skills",
     "license": "Apache-2.0",
     "keywords": ["wso2", "<topic>"]
   }
   ```

   **Also add Codex plugin metadata** at `plugins/<plugin-name>/.codex-plugin/plugin.json`. Reuse the same core fields, then add `skills` and the required `interface` block:

   ```json
   {
     "name": "<plugin-name>",
     "version": "0.1.0",
     "description": "Short description of what the plugin does.",
     "author": { "name": "WSO2", "url": "https://wso2.com" },
     "homepage": "https://github.com/wso2/agent-skills",
     "repository": "https://github.com/wso2/agent-skills",
     "license": "Apache-2.0",
     "keywords": ["wso2", "<topic>"],
     "skills": "./skills/",
     "interface": {
       "displayName": "<Display Name>",
       "shortDescription": "One-line subtitle.",
       "longDescription": "Longer description for the details page.",
       "developerName": "WSO2",
       "category": "Engineering",
       "capabilities": ["Interactive", "Read", "Write"],
       "defaultPrompt": ["Example starter prompt."]
     }
   }
   ```

3. **Add one or more skills** under `plugins/<plugin-name>/skills/<skill-name>/SKILL.md`. Each `SKILL.md` should declare its triggers, workflow steps, and any allowed tools. Place supporting references in `references/` and helper scripts in `scripts/` next to the `SKILL.md`.

4. **Add a plugin README** at `plugins/<plugin-name>/README.md` with a one-line summary, an install snippet, and a table of skills.

5. **Register the plugin** in both marketplace files:

   In the top-level `.claude-plugin/marketplace.json`, append to the `plugins` array:

   ```json
   {
     "name": "<plugin-name>",
     "source": "./plugins/<plugin-name>",
     "description": "Short description.",
     "category": "development",
     "tags": ["wso2", "<topic>"]
   }
   ```

   In the top-level `.agents/plugins/marketplace.json`, append to the `plugins` array:

   ```json
   {
     "name": "<plugin-name>",
     "source": { "source": "local", "path": "./plugins/<plugin-name>" },
     "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
     "category": "Engineering"
   }
   ```

6. **List the plugin** in the top-level [README.md](./README.md) Plugins table.

## Local Development

To test a plugin without publishing, point Claude Code at the plugin directory directly:

```
claude --plugin-dir /path/to/agent-skills/plugins/<plugin-name>
```

This loads the plugin's skills into the Claude Code session as if installed from the marketplace, so you can iterate on `SKILL.md`, references, and scripts and see the changes in the next turn.

Tips:

- **Iterate on a single skill.** Edit `SKILL.md` and trigger it in the running session — no restart needed for content changes. Restart the session if you change the plugin's manifest or add a new skill directory.
- **Test trigger phrasing.** Skills only run when the model recognizes the trigger described in `SKILL.md`. Try a few phrasings and refine the description if a skill is not firing.
- **Reference loading.** Skills should load reference files on demand via `Read`, not eagerly. Keep `SKILL.md` short and push detail into `references/`.
- **Scripts.** Make any scripts under `scripts/` executable and ensure they run from the plugin root with no extra setup.

## PR Validation Checks

Every pull request runs `.github/workflows/validate.yml`, which enforces the [Agent Skills spec](https://agentskills.io/specification) and the documented [Claude Code plugin rules](https://code.claude.com/docs/en/plugins-reference). The validator is self-contained — it needs only Node and the `yaml` package, so it runs the same in CI and locally for any contributor. Run the same checks locally before opening a PR:

```bash
npm ci
node .github/scripts/validate-skills.js
bash .github/scripts/check-script-syntax.sh
```

The validator checks each skill and manifest for:

- **SKILL.md frontmatter** — `name` present, lowercase kebab-case, ≤64 chars, and **matching its directory name**; `description` present and ≤1024 chars; `compatibility` ≤500 chars; only spec-allowed frontmatter keys (`name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`). Frontmatter is parsed with the `yaml` package, so malformed YAML fails the check.
- **Reference paths** — every `references/`, `scripts/`, or `assets/` file mentioned in a `SKILL.md` actually exists.
- **plugin.json** — valid JSON, `name` present and lowercase kebab-case, valid semver `version` if set.
- **marketplace.json** — valid JSON, every `source` starts with `./` and resolves to a real directory, and every plugin on disk is listed (and vice versa).
- **Body size** (warning only) — `SKILL.md` over 500 lines, per spec guidance.

The workflow additionally runs `node --check` / `bash -n` on bundled scripts to catch syntax errors before merge.


## Testing the Marketplace Locally

To test the full marketplace install flow against your local checkout:

In Claude Code:

```
/plugin marketplace add /path/to/agent-skills
/plugin install <plugin-name>@wso2-agent-skills
```

In Codex:

```bash
codex plugin marketplace add /path/to/agent-skills
codex plugin add <plugin-name>@wso2-agent-skills
```

This validates that both marketplace files and the plugin's manifests are consistent before you open a PR.

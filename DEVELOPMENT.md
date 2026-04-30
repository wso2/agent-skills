# Developer Docs

This guide covers how to contribute to the WSO2 Agent Skills monorepo — adding new plugins and testing them locally.

## Repo Layout

```
.claude-plugin/marketplace.json   — marketplace index listing all plugins
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json    — plugin metadata (name, version, author, license)
    README.md                     — plugin overview and skill list
    skills/
      <skill-name>/
        SKILL.md                  — skill definition (triggers, workflow, allowed tools)
        references/               — reference docs the skill loads on demand
        scripts/                  — helper scripts the skill invokes
```

## Adding a New Plugin

1. **Create the plugin directory**

   ```
   plugins/<plugin-name>/
   ```

2. **Add plugin metadata** at `plugins/<plugin-name>/.claude-plugin/plugin.json`:

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

3. **Add one or more skills** under `plugins/<plugin-name>/skills/<skill-name>/SKILL.md`. Each `SKILL.md` should declare its triggers, workflow steps, and any allowed tools. Place supporting references in `references/` and helper scripts in `scripts/` next to the `SKILL.md`.

4. **Add a plugin README** at `plugins/<plugin-name>/README.md` with a one-line summary, an install snippet, and a table of skills.

5. **Register the plugin** in the top-level `.claude-plugin/marketplace.json` by appending an entry to the `plugins` array:

   ```json
   {
     "name": "<plugin-name>",
     "source": "./plugins/<plugin-name>",
     "description": "Short description.",
     "category": "development",
     "tags": ["wso2", "<topic>"]
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

## Testing the Marketplace Locally

To test the full marketplace install flow against your local checkout:

```
/plugin marketplace add /path/to/agent-skills
/plugin install <plugin-name>@wso2-agent-skills
```

This validates that `marketplace.json` and the plugin's `plugin.json` are consistent before you open a PR.

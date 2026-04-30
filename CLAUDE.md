# WSO2 Agent Skills — Developer Guidance

This is a monorepo of agent skills for WSO2 products.

## Repo Layout

```
.claude-plugin/marketplace.json   — marketplace index (name: wso2-agent-skills)
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json    — plugin metadata
    skills/<skill-name>/SKILL.md  — skill definition (one per skill)
```

## Working with Skills

- Each skill lives in its own directory under `plugins/<plugin>/skills/`
- SKILL.md defines triggers, workflows, and allowed tools
- Supporting files (references, assets, scripts) sit alongside SKILL.md

## Local Testing

Point your agent at a plugin directory directly:
```
claude --plugin-dir plugins/api-platform
```

# WSO2 Agent Skills

Official Agent skills for building and managing with WSO2 products.

## Install

### Option 1 — npx skills

Install all WSO2 skills:
```
npx skills add wso2/agent-skills
```

### Option 2 - Claude Code

Register the marketplace:
```
/plugin marketplace add wso2/agent-skills
```

Install a plugin:
```
/plugin install api-platform@wso2-agent-skills
```

## Plugins

| Plugin | Description |
|--------|-------------|
| [api-platform](./plugins/api-platform/README.md) | Design, assess, and fix OpenAPI specs; deploy and manage APIs via the WSO2 API Gateway |

## Adding a New Plugin

1. Create `plugins/<plugin-name>/`
2. Add `.claude-plugin/plugin.json` with name, version, author, license
3. Add `skills/<skill-name>/SKILL.md` for each skill
4. Register the plugin in `.claude-plugin/marketplace.json`


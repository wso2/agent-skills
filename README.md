# WSO2 Agent Skills

Official Agent skills for building and managing with WSO2 products.

## Plugins

| Plugin | Description |
|--------|-------------|
| [api-platform](./plugins/api-platform/README.md) | Design, assess, and fix OpenAPI specs; deploy and manage APIs via the WSO2 API Gateway |
| [agent-manager](./plugins/agent-manager/README.md) | Deploy and inspect agents; tail logs, metrics, and traces; triage runtime failures |

## Installation

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
/plugin install agent-manager@wso2-agent-skills
```

### Option 3 - Codex

Register the marketplace:
```bash
codex plugin marketplace add wso2/agent-skills
```

Install a plugin:
```bash
codex plugin add api-platform@wso2-agent-skills
codex plugin add agent-manager@wso2-agent-skills
```

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for instructions on adding new plugins.

## License

You are free to copy, modify, and distribute these skills under the terms of the Apache 2.0 license. See the [LICENSE](./LICENSE) file for details.


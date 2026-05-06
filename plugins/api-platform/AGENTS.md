# api-platform Plugin — Agent Conventions

## Skills in this Plugin

- [`skills/api-design/`](./skills/api-design/SKILL.md) — OpenAPI spec design, assessment, and fix workflows
- [`skills/api-publish/`](./skills/api-publish/SKILL.md) — WSO2 gateway setup, API deployment, and policy management

## api-design Skill

Three distinct workflows — always confirm with the user which they need:
1. **Design** — guided 7-step process to produce an OpenAPI 3.x YAML from scratch
2. **Assess** — run Spectral + LLM checks across AI readiness, security, and design dimensions
3. **Fix** — apply targeted fixes to issues found in an existing spec

## api-publish Skill

Three sequential phases:
1. **Setup** — install `ap` CLI, start Docker gateway, connect and verify health
2. **Expose** — take a spec or endpoint list, generate RestApi YAML, deploy and test
3. **Manage** — add auth, rate limiting, CORS, or header policies post-deployment

## Key Reference Files

- `skills/api-design/references/` — WSO2 REST design guidelines, agent-readiness rules, OWASP-derived security rules
- `skills/api-design/scripts/` — Spectral rule runners and report generators
- `skills/api-design/assets/` — spec templates and fixtures used during the Design workflow
- `skills/api-publish/references/` — `ap` CLI reference, RestApi YAML examples, Docker networking guide
- `skills/api-publish/scripts/` — gateway setup and `ap` CLI installation scripts

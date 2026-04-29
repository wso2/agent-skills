# api-platform Plugin — Agent Conventions

## api-design Skill

Handles three distinct workflows — always confirm with the user which they need:
1. **Design** — guided 7-step process to produce an OpenAPI 3.x YAML from scratch
2. **Assess** — run Spectral + LLM checks across AI readiness, security, and design dimensions
3. **Fix** — apply targeted fixes to issues found in an existing spec

## api-platform Skill

Three sequential phases:
1. **Setup** — install ap CLI, start Docker gateway, connect and verify health
2. **Expose** — take a spec or endpoint list, generate RestApi YAML, deploy and test
3. **Manage** — add auth, rate limiting, CORS, or header policies post-deployment

## Shared Conventions

- Never skip the assessment offer after generating a spec (api-design step 7)
- Always handle Docker networking (localhost → host IP) before deploying
- Fetch policy metadata from `wso2/gateway-controllers` repo at management time

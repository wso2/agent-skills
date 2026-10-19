# asgardeo Plugin — Agent Conventions

## Skills in this Plugin

- [`skills/asgardeo/`](./skills/asgardeo/SKILL.md) — manage Asgardeo end-to-end through the `asg` CLI

## asgardeo Skill

Two mandatory **gates** followed by an **intent router** into six tracks:

- **Gate 1 — a session.** `asg --help` (install the release via `scripts/install-asg-cli.js` if missing), then `asg status`; if not authenticated, the user runs `asg login` (the agent runs it only on the browser path, when asked) and the agent re-verifies.
- **Gate 2 — an approved plan.** Ask the track's questions first (names, URIs, scopes), then present the plan — *what I'll create*, *what changes in your code*, *how you'll know it worked* — and create nothing until the user approves.
- **Track A — Authenticate an app** — register an SPA/OIDC/mobile app, wire the framework's Asgardeo SDK from the docs quickstart with the real `clientId` and `baseUrl`, create a test user, prove login.
- **Track B — Authorize an app** — RBAC over API scopes in order: API resource + scopes → authorize the app → role audience → roles carrying the scopes → JWT tokens → enforce by checking the token's `scope` claim.
- **Track C — Manage resources** — direct CLI operations; feature areas with no CLI verb go through `asg api` per `references/management-apis.md`.
- **Track D — Troubleshoot** — a 403 is a role-permission gap, never a session problem; login failures start with the redirect URI.
- **Track E — Agent identity** — an AI agent's own credentials, roles and tokens, acting on its own or on a user's behalf; the secret is handed off with `--env-file` and never passes through chat.
- **Track F — Secure an MCP server** — register the server as an `MCP` API resource and its client as an `mcp` app, roles per scope, protect the server with `@asgardeo/mcp-express` or FastMCP plus per-tool scope checks.

## Conventions

- **A credential is never yours.** Login is the user's; client and agent secrets stay in the Console or go straight to an env file the CLI writes.
- **Read the CLI, don't memorize it.** `asg <cmd> --help` for exact flags; `--format json` with `-N -y` for unattended runs.
- **Fetch the docs' markdown twins.** Every docs page exists as `<path>.md` (index: `docs/llms-full.txt`); never the HTML page.
- **Every summary carries the Console link** of each resource created or changed.
- **Bundled scripts are Node (builtins only) or bash — no Python.**

## Key Reference Files

- `skills/asgardeo/references/auth.md` — CLI login: who runs it, the browser path, special cases, session errors
- `skills/asgardeo/references/planning.md` — the plan's three headings and one-table-per-resource shape (Gate 2)
- `skills/asgardeo/references/cli-overview.md` — intent → command map, output parsing, unattended-run and app gotchas, Console links, failure diagnosis
- `skills/asgardeo/references/authorize-app.md` — the full RBAC pipeline with exact commands (Track B)
- `skills/asgardeo/references/authentication-methods.md` — social/enterprise login, MFA, passwordless; editing an app's login flow (Track A)
- `skills/asgardeo/references/sdk-integration.md` — framework → app type, SDK and docs page; inputs every integration needs; calling a protected API; reading roles
- `skills/asgardeo/references/agent-identity.md` — agent credentials, roles and tokens; acting on a user's behalf; SDK calls by language (Track E)
- `skills/asgardeo/references/mcp-server.md` — MCP server as a resource, the client app shape, protecting the server, the Inspector proof (Track F)
- `skills/asgardeo/references/management-apis.md` — feature areas with no CLI verb → their REST APIs via `asg api` (Track C)
- `skills/asgardeo/scripts/install-asg-cli.js` — downloads the pinned `asg-v*` release from wso2/wso2-cli and verifies its checksum

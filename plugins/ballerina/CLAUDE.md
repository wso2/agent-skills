# ballerina Plugin — Agent Conventions

Ballerina language support: LSP code intelligence for `.bal` files plus an AI
coding assistant for writing integrations, discovering libraries, and running projects.

## Components

- **`ballerina` skill** ([`skills/ballerina/SKILL.md`](./skills/ballerina/SKILL.md)) — writes, runs,
  and tests Ballerina programs and integrations. Triggers on requests to create/update/fix
  Ballerina code, scaffold a project, build an HTTP service or integration, or set up the toolchain.
- **`library` sub-agent** ([`agents/library.md`](./agents/library.md)) — discovers Ballerina
  libraries and returns a compact API summary. Backed by the bundled `ballerina-library` MCP server.
- **`ballerina-library` MCP server** (`mcp/`) — `search_libraries` / `get_library` over `bal search`
  + the Ballerina Central API. Ships **pre-bundled** at `mcp/dist/server.js` (self-contained, no
    `npm install` after install). Wired via [`.mcp.json`](./.mcp.json).
- **Language server** — configured in [`.lsp.json`](./.lsp.json), referenced from
  `plugin.json` (`lspServers`). Runs `bal start-language-server` for completions, hover, and diagnostics.
- **Hooks** (`hooks/`) — silently remind the model to use the skill on Write/Edit/Bash and mark
  skill activation. Configured in [`hooks/hooks.json`](./hooks/hooks.json).

## Skill reference files (loaded on demand)

- `skills/ballerina/setup.md` — installing Ballerina / `bal`, version requirements
- `skills/ballerina/code-rules.md` — idiomatic Ballerina rules the skill enforces while writing code
- `skills/ballerina/langlib-reference.md` — lang-library API quick reference
- `skills/ballerina/troubleshooting/` — symptom-indexed fix guides (http, sql, graphql, grpc-websocket,
  messaging, data-binding, auth, compiler, runtime, deployment, packages, performance, tooling); start
  at `troubleshooting/index.md`

## Prerequisites

- Ballerina >= 2201.12.0 (Swan Lake Update 12+), `bal` on `PATH`
- Node.js >= 18 (only to run the bundled MCP server; no build step needed at install time)

## Maintaining the MCP server

Source lives in `mcp/src/` + `mcp/server.js`. The shipped artifact is `mcp/dist/server.js` —
**regenerate it after any source change** with `npm run build` inside `mcp/` (esbuild bundle).
`mcp/node_modules/` is gitignored; the committed `dist/` bundle is what runs in production.

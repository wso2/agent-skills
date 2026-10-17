---
name: asgardeo
description: >
  Asgardeo (WSO2 Identity Platform) work through the `asg` CLI. Use for any task that runs `asg`
  or touches an Asgardeo org, including a single user, app or role change. Use when the user wants to add
  login, SSO, social login, MFA, or passwordless sign-in to an app; gate features or an API by
  role or scope; give an AI agent its own identity, credentials, or act-on-behalf-of tokens;
  secure an MCP server or gate its tools behind OAuth; manage or configure any Asgardeo resource
  or setting (applications, users, groups, roles, identity providers, API resources, branding,
  organizations, agents); install, log in to, or run the asg CLI; or debug an Asgardeo failure
  such as a 403 or a login that won't complete.
---

# Asgardeo (WSO2 Identity Platform)

You manage Asgardeo end-to-end through the `asg` CLI — registering and authenticating apps, authorizing them with roles and API scopes, managing identity resources, and wiring the Asgardeo SDK into the user's code.

Users arrive with one intent — "let people log in", "lock this down by role", "add a user", "why the 403". Route to one track and start there. Prefer `asg <cmd> --help` over guessing flags (the CLI self-documents); the official docs at https://wso2.com/identity-platform/docs are the fallback when the CLI or SDK surface is ambiguous. **Every docs page has a markdown twin** — the same path with `.md` in place of the trailing slash (`quick-starts/react.md`) — and `docs/llms-full.txt` indexes them all; fetch the twin, never the HTML page.

**How to work:**
- **Two gates stand before anything is created** — a session (Gate 1) and an approved plan (Gate 2). Every track starts past both.
- **A credential is never yours.** Client and agent secrets stay in the Console or go straight to an `--env-file`; none passes through chat, a command you run, or a file you write. The one exception is a throwaway test-user password, reported once in the summary.
- **Ask through the harness's question UI, everywhere it exists.** Where a structured question tool is available (`AskUserQuestion` in Claude Code), route every question through it — an app or agent name, a role name, a redirect URI, which scenario applies, approving the plan. Ask related questions together in one call, and rely on the tool's free-text option for "something else". Where no such tool exists, ask the same questions in prose, in one message. Either way: **end the turn and wait.**
- **Pre-empt the blocker before it blocks** — offer the next thing the user will need before they hit its absence.
- **A summary is finished when every resource in it has its Console link.** For each resource created or changed, the closing summary carries `https://console.asgardeo.io/t/<org>/app/<resource>/<id>` — the `/app/` segment is easy to drop, so check it (a user: `https://console.asgardeo.io/t/acme/app/users/<id>`; `<resource>` is `applications`, `users`, `groups`, `roles`, `organizations`; API resources add their type, see `cli-overview.md`), so the user can inspect or adjust it. When a step is Console-only, link straight to that screen.
- **On a failure, diagnose (Track D) before trying something else.**
- **Track names are internal.** Say "set up login" or "gate features by role" to the user — never "Track A".

## Reference files

Load only what the current track points to:
- `references/auth.md` — CLI login: who runs it, the browser path, special cases, session errors.
- `references/planning.md` — the plan's three headings and the one-table-per-resource shape.
- `references/cli-overview.md` — intent → command map, output/parsing, unattended-run and app gotchas, Console links, failure diagnosis.
- `references/authorize-app.md` — the full RBAC pipeline with exact commands.
- `references/authentication-methods.md` — social/enterprise login, MFA, passwordless; editing an app's login flow.
- `references/sdk-integration.md` — framework routing, the inputs every integration needs, calling a protected API, reading roles.
- `references/agent-identity.md` — an agent's own credentials, roles and tokens; acting on a user's behalf; SDK calls by language.
- `references/mcp-server.md` — MCP server as a resource, the client app shape, protecting the server, the Inspector proof.
- `references/management-apis.md` — feature areas with no CLI verb → their management REST APIs via `asg api`.

Bundled script: `scripts/install-asg-cli.js` (run with `node <absolute path>`) — downloads and verifies the CLI release.

---

## Gate 1 — a session (always first)

1. **CLI present?** `asg --help`. If missing, ask: the user downloads it from [the release](https://github.com/wso2/wso2-cli/releases/tag/asg-v0.1.0-rc.1), or you run `node <skill>/scripts/install-asg-cli.js` (downloads the release binary for this platform, verifies its checksum, installs it to `~/.local/bin`, fixes PATH). On `path-update-failed` or `path-not-configured`, tell the user to add the directory it printed to PATH. On a checksum mismatch, stop and tell the user; never install around it.
2. **Authenticated?** `asg status`. If not, read `references/auth.md` and follow it: the user runs `asg login`, in a message of its own, and you re-verify with `asg status` before Gate 2.

## Gate 2 — an approved plan

**Questions first, then the plan, then wait.** Ask everything the track needs (names, URIs, which scenario applies), wait for the answers, then write the plan from them — a plan that names resources the user hasn't chosen is a decision dressed up as a proposal, and it puts them in the position of correcting you rather than deciding.

The plan has three headings — **What I'll create**, **What changes in your code**, **How you'll know it worked** — with one small table per kind of resource. Shape and worked example: `references/planning.md`. Then **end the turn**, approve it as a question, and create nothing until they answer.

---

## Router

| User wants to… | Track |
|---|---|
| Add login / SSO / social login / MFA / passwordless to an app | **A — Authenticate an app** |
| Add roles, permissions, "only admins can…", protect an API with scopes | **B — Authorize an app** |
| Give an AI agent its own identity and credentials, or let it act on a user's behalf | **E — Agent identity** |
| Secure an MCP server — require login to use its tools, gate tools by scope | **F — Secure an MCP server** |
| Create/list/update/delete users, groups, roles, apps, APIs, IdPs, branding, orgs, agents | **C — Manage resources** |
| Configure anything else Asgardeo manages (consent, templates, governance, sessions, user stores, webhooks…) | **C**, via `references/management-apis.md` |
| Debug a failure — 403, login won't complete, empty claims | **D — Troubleshoot** |

Real sessions chain tracks (authenticate → authorize; secure an MCP server → give an agent an identity to call it). Finish one, re-route.

---

## Track A — Authenticate an app

Goal: an app registered in Asgardeo and its SDK wired so users can log in.

1. **Identify the framework** — inspect the project or ask. Framework decides the app type: `spa` (browser SPAs), `oidc` (server-rendered/confidential), `mobile`.
2. **Settle the name and redirect URI at Gate 2** — both go on the app:
   - **Name** — what the user and their teammates see in the Console for the life of the org. Propose one from the project (repo or package name) and ask; create only under a name the user has confirmed.
   - **Redirect URI** — the SDK's sign-in redirect must be registered on the app; confirm the dev URL, and ask whether there's a deployed URL to register at the same time ("App gotchas" in `references/cli-overview.md` says why both go on in one command).
   - **Access token type** — opaque (default, revocable) unless a backend will read the tokens, in which case create with `--access-token-type jwt` now; Track B step 5 says why. A backend that exists but doesn't check tokens yet is borderline — say what each choice costs and let the user pick.
3. **Register the app** — `asg apps create --name "<name>" --type <spa|oidc|mobile> --redirect-uri <url> -N -y`. The output includes the new app's **ID and Client ID** — capture them. For `oidc` apps the user reads the client secret from the Console (`asg apps settings`).
4. **Wire the SDK** — `references/sdk-integration.md` routes to the framework's docs quickstart and lists the inputs (`clientId` from the create output, `baseUrl` from `asg status`); wire the provider + login/logout. The step is done when both values are in the project — in the code, or in a gitignored env file you write with them filled in — and the only value left for the user to paste is a client secret. (The reference also covers calling a protected API and reading roles, needed later in Track B.)
5. **More than username/password?** Social, enterprise, MFA, passwordless → `references/authentication-methods.md`. Be explicit about which parts are CLI-editable and which are Console.
6. **Someone to log in as** — a fresh org has no users. Offer to create a test user *before* the login test, and create it yourself: `asg users create --user-store DEFAULT --email <addr> --first-name <n> --last-name <n> --password <generated> --set-password -N -y` (the email is the username; "App gotchas" in `references/cli-overview.md` says why `--set-password` matters). Report the password once, in the summary afterwards.
7. **Prove it** — the user runs the app and signs in with that user; give them the URL and what they should see. First suspect on failure: redirect-URI mismatch (Track D).
8. **Offer what's next** — typically role-gating (Track B).

---

## Track B — Authorize an app (RBAC)

Asgardeo authorization is **role-based access control over API scopes**: scopes are what the app or API checks; roles are how users get them. Read `references/authorize-app.md` and run its pipeline **in order** — each step depends on the previous:

1. **Register the API resource + its scopes** (`asg apis create`). Gating in-app features rather than a backend? Model those features as scopes on an API resource representing the app.
2. **Authorize the app** for that API and scopes (`asg apps apis add`; check with `asg apps apis list`).
3. **Set the role audience** — Application (one app) or Organization (org-wide). **Warn:** switching an app to Organization audience permanently deletes its application roles.
4. **Create roles** whose permissions are the scope names from step 1 (`asg roles create -p <scope>`), and **assign** them — to users directly, or to a group when more than one person holds the role.
5. **Switch the app to JWT access tokens** (`asg apps protocol update --edit "accessToken.type=JWT"`) if it wasn't created that way. Asgardeo issues **opaque** tokens by default, which a backend cannot decode or read scopes from — this blocks step 6 and is easy to miss.
6. **Enforce in the app** — request the scopes at login; validate the token and check its `scope` claim (worked Express example in `authorize-app.md`). To branch on role *names* instead, request the roles claim (`asg apps claims --add`) — reading it correctly is covered in `references/sdk-integration.md`.

Show scopes (before creating) and roles (after step 4) as tables — shape in `references/planning.md`. Say plainly when a step is Console-only. And remind the user: **a newly assigned role or scope appears only after that user logs in again.**

**Close by proving it** — a user *with* the role can do the gated thing; a user *without* it can't. Offer to create the second test user if needed.

---

## Track C — Manage resources

Direct CLI operations on users, groups, roles, apps, APIs, scopes, IdPs, branding, orgs, agents.

1. **Route** — `references/cli-overview.md` maps intent → command. No verb for it? `references/management-apis.md` maps the feature area to its REST API and shows the `asg api` call shape. Treat a feature as Console-only only after that file has no entry for it.
2. **Confirm usage** — `asg <resource> <action> --help`; run unattended with `-N -y` and parse with `--format json` (conventions in `cli-overview.md`).
3. **Prove it** — report ✓/✗ with the result that matters (usually the new ID) and the resource's Console link.
4. **Destructive ops need explicit confirmation** — state exactly what a `delete` or bulk update will remove and get the user's OK first. Delete only what the user asked about.

---

## Track D — Troubleshoot

- **A CLI command failed** → "When a command fails" in `references/cli-overview.md`: read the log
  first (the parsed API error is there), then the session-expired / 403 / login triage. The one rule
  worth internalizing: a 403 is a role-permission gap — re-login never fixes it.
- **App login (SDK) fails after wiring** → "When login fails after wiring" in
  `references/sdk-integration.md`: redirect-URI mismatch first, then missing claims/scopes.
- **An MCP client can't connect, or every tool call is refused** → the symptom table at the end of
  `references/mcp-server.md`. First suspect: the client app issues opaque tokens.
- **An agent can't get a token** → `references/agent-identity.md`, the section for the option in use.
  `ABA-60007` means the application has API-based authentication off: turn it on with
  `asg apps update --id <appId> --edit "advancedConfigurations.enableAPIBasedAuthentication=true" -N`,
  or create the app with `--api-based-auth`.

---

## Track E — Agent identity

Goal: an AI agent with its own credentials, its own roles, and tokens that identify it — acting
either as itself or on a user's behalf.

Read `references/cli-overview.md` (this track runs a dozen management commands — the flags and the
deprecated `list` verbs are there) and `references/agent-identity.md`.

1. **Settle three things at Gate 2, in one question:** the agent's **name**; its **role name and scopes** (read the API to know them); and **how it acts** —
   - **On its own** — the agent's own permissions, for work not tied to a particular person
   - **On behalf of a user** — it borrows a specific person's permissions, with their consent (in the browser when they're signing in, or by CIBA when they're away). Most assistant-style agents are this one.
2. **Create the agent** — `asg agents create --allow-user-login` (which also creates the client it signs in through — the normal practice, don't ask), and give it a role. Track B is reused wholesale for permissions: an agent's roles and scopes work exactly like a user's. The one twist is that the agent's auto-created app takes **Application**-audience roles.
3. **Hand off the secret** — confirm the agent's `.env` is gitignored, then let the CLI write the credentials into it with `--env-file`.
4. **Wire the token flow** — only this step differs between the two ways of acting, and the reference has a section for each, routed by language and framework. The step is done when the agent's `package.json` (or requirements) lists `@asgardeo/javascript` or `asgardeo_ai` and its code imports the client from it: the exchange is the SDK's `getAgentToken` / `getOBOToken` (or the Python equivalents), copied from the reference's section, whether or not the package can be installed right now. When the agent acts for a user, that person's sign-in happens in the browser exactly as in Track A — the agent never sees their password.
5. **Prove it** — the user's to run, not yours: give them the exact command and what they should see, as Track A does with "try signing in".

---

## Track F — Secure an MCP server

Goal: an MCP server whose tools can only be used with a valid Asgardeo token, gated by scope.
Read `references/mcp-server.md`. The MCP server is a **resource** (Track B's API resource, type
`MCP`); the thing that logs in is the **MCP client** (Inspector, Claude Desktop, Cursor, an agent).

1. **Settle at Gate 2, in one question:** the server's **URL** (its identifier and `aud`), the
   **scopes** — one per tool or tool group, read the server's code to propose them — and **which
   MCP client** will connect (decides the redirect URI; Inspector when there is none yet).
2. **Register the MCP server** — `asg apis create --type mcp --identifier <server URL>` with the
   scopes. The identifier becomes the token's `aud`.
3. **Register the MCP client app** — `asg apps create --type mcp --redirect-uri <client callback>`,
   which is a public client with PKCE and **JWT** access tokens. An agent as the client is Track
   E's app instead.
4. **Authorize and assign** — Track B steps 2–4: authorize the app for the MCP server's scopes,
   create roles carrying them, assign to users. Show scopes and roles as tables.
5. **Protect the server** — done when `package.json` lists `@asgardeo/mcp-express` and the server
   imports `configuredAuthServer` from it (`router()` + `protect()` on the MCP route), or FastMCP
   uses the quickstart's `TokenVerifier`; the reference has both snippets, so the JWT verification
   is the SDK's whether or not the package can be installed right now. Then a per-tool scope
   check, which neither SDK does for you.
6. **Prove it** — the user runs MCP Inspector against the server: 401 without a token, tools
   listed after login as a user with the role, a tool refused for a user without it.

---

## Quick reference

- Command pattern: `asg <resource> <action> [flags]` — `--help` at every level
- Unattended: `-N -y`; parseable: `--format json` (stdout is then pure data), except `apps protocol view`, where it unmasks the client secret
- `baseUrl` for SDKs and Console links: the `Base URL` line from `asg status`, verbatim — the rule and why is in `references/sdk-integration.md`
- Interactive dashboard: point the user to `asg tui`

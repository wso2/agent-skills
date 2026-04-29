---
name: asgardeo-auth
description: >-
  End-to-end Asgardeo authentication setup for any application — CLI-based org
  configuration, OAuth2 app registration, SDK installation, and minimal auth
  integration (provider + login/logout). Use when users want to add Asgardeo
  authentication to their app, integrate the Asgardeo SDK, set up login/logout,
  register an OAuth2 application in Asgardeo, configure the Asgardeo CLI, or
  add SSO/OIDC to a React, Next.js, Vue, or Node/Express application. Also
  trigger on: "add auth to my app", "integrate Asgardeo", "Asgardeo login",
  "Asgardeo SDK", "set up Asgardeo".
---

# Asgardeo Auth Skill

Implements end-to-end Asgardeo authentication for an application using the Asgardeo CLI
and the official Asgardeo SDKs.

**Supported frameworks:** React (Vite/CRA), Next.js ≥15.3, Vue 3, Express.js

**SDK packages used:**

| Framework | Package |
|---|---|
| React | `@asgardeo/react` |
| Next.js | `@asgardeo/nextjs` |
| Vue 3 | `@asgardeo/vue` |
| Express | `@asgardeo/express` |

---

## Operating Rules

- **Never execute immediately.** Always assess silently, present a plan, then confirm before touching files or running commands.
- Assume `asgardeo` is on the user's PATH. If `which asgardeo` fails, tell the user to install or build the CLI binary first.
- The M2M (management) app client ID and secret are for the CLI to authenticate with Asgardeo's management API — they are NOT used in the user's application code.
- **The SDK `clientId` is the OAuth2 consumer key, NOT the app UUID.** `asgardeo app list` returns UUIDs. The consumer key is retrieved via `asgardeo app get --oidc`. Always use the consumer key in SDK config.
- The CLI always creates **confidential clients** (with a `clientSecret`). Include `clientSecret` in the SDK provider config.
- **Use the declarative config file as the source of truth for org state.** Generate or update `.asgardeo/config-<profile>.yaml` using the schema in `schema/config-profile.yaml`, then apply changes with `asgardeo apply`. Do not use `asgardeo app create` for apps tracked by a config file.
- When a `.asgardeo/config-<profile>.yaml` already exists, always read it first and merge new entries — never overwrite the whole file blindly.
- Always set `allowed_origins` in the config file for browser-based apps — without it, all SDK calls are blocked by CORS.
- Always include `internal_login` in scopes so the SDK can fetch the user's profile via SCIM2.
- Write only minimal integration: provider + login/logout + user display name. No protected routes, no role-based access, no token refresh handling unless explicitly asked.
- Never store the M2M client secret in application code or `.env` files committed to git.
- Always check if the CLI is already authenticated before running `asgardeo auth login`.
- Detect the framework from `package.json` before asking the user.

---

## Config File Schema

Asgardeo CLI uses two files inside the `.asgardeo/` directory:

| File | Purpose |
|---|---|
| `.asgardeo/config.yaml` | Global CLI settings (base URL, output format). Managed by the CLI — do not edit manually. |
| `.asgardeo/config-<profile>.yaml` | Declarative org state for a profile. **This is what the skill generates and updates.** |

The profile name is the org slug (e.g., `config-giga.yaml` for org `giga`). When the user works with a named environment (e.g., `prod`), the file is `config-prod.yaml`.

**Full schema:** `schema/config-profile.yaml`

Read that file before generating or updating any `.asgardeo/config-<profile>.yaml`. It defines all valid fields, types, and allowed values.

---

## Interaction Protocol

### Step 1 — Assess silently

Before saying anything, run these checks:

```bash
# Check CLI is available
which asgardeo

# Determine CLI auth state — three possible outcomes:
#   EXIT 0 + JSON output  → authenticated, parse org name from output
#   EXIT non-zero, error mentions "no profile" or "not configured" → no profile exists
#   EXIT non-zero, error mentions "unauthorized" / "token expired"  → profile exists but session expired
asgardeo whoami --output json 2>&1

# List existing profiles (helps distinguish "no profile" from "wrong active profile")
asgardeo config list 2>/dev/null

# Detect framework from package.json if it exists
cat package.json 2>/dev/null
```

Classify the CLI state as one of:

| State | Symptom | Action needed |
|---|---|---|
| **Authenticated** | `whoami` returns JSON with org | Nothing — skip Phase 1 |
| **Session expired** | `whoami` fails with auth/token error, but `config list` shows a profile | `asgardeo auth login` only |
| **No profile** | `whoami` fails and `config list` is empty or missing | `asgardeo config create` + `asgardeo auth login` |

Also read:
- `package.json` — framework detection (look for `next`, `react`, `vue`, `express`)
- `.asgardeo/` — check for existing `config-<profile>.yaml` files to determine current org state

### Step 2 — Present a plan

Show the user a clear plan and confirm before proceeding:

```
Here's what I'll do to add Asgardeo auth to your app:

  1. Verify the Asgardeo CLI is configured and authenticated
  2. Register the OAuth2 app in .asgardeo/config-<profile>.yaml
  3. Apply the config to Asgardeo with `asgardeo apply`
  4. Retrieve the OAuth2 consumer key (clientId for SDK)
  5. Install the Asgardeo SDK for [detected framework]
  6. Add the auth provider and login/logout to your app

Your framework: [detected / unknown — I'll ask]
CLI status:     [authenticated as <org> / session expired — need to login / no profile — need credentials]
Config file:    [.asgardeo/config-<profile>.yaml exists / will be created]

Proceed with all steps, or tell me which to skip.
```

### Step 3 — Gather required information

Collect the following (check first if already known from project files or previous commands):

| Info | When to ask |
|---|---|
| Asgardeo org name (slug) | State C only (no profile configured) |
| M2M client ID | State C only — explain it's for a management app, not the user's own app |
| M2M client secret | State C only |
| Profile name | If multiple profiles exist; default to the org name |
| Application name | Always (suggest the project directory name) |
| Redirect URI | Always (suggest framework-appropriate default) |
| Framework | If not auto-detected |

Ask all needed questions in a single message, not one at a time.

**Suggested redirect URI defaults by framework:**

| Framework | Suggested default |
|---|---|
| React (Vite) | `http://localhost:5173/callback` |
| React (CRA) | `http://localhost:3000/callback` |
| Next.js | `http://localhost:3000/api/auth/callback` |
| Vue | `http://localhost:5173/callback` |
| Express | `http://localhost:3000/callback` |

### Step 4 — Confirm before file writes

Before writing any files, list exactly what will be created or modified:

```
I'll make these changes:

  Update: .asgardeo/config-<profile>.yaml  (add <app_name> under applications)
  Run:    asgardeo apply
  Install: @asgardeo/react
  Modify:  src/main.tsx  (wrap app in AsgardeoProvider)
  Modify:  src/App.tsx   (add login/logout + user display name)

Proceed?
```

### Step 5 — Summary after completion

```
Done. Asgardeo auth is set up.

  Org:           <org_name>
  Profile:       <profile>
  Config file:   .asgardeo/config-<profile>.yaml
  App Name:      <app_name>
  Client ID:     <consumer_key>  (OAuth2 consumer key, not the app UUID)
  Client Secret: <client_secret>
  Redirect URI:  <redirect_uri>
  SDK:           @asgardeo/react

Files changed:
  - .asgardeo/config-<profile>.yaml
  - src/main.tsx
  - src/App.tsx

Next steps:
  1. Run your app: npm run dev
  2. Clear browser site data before first login (avoid stale OIDC cache)
  3. Test login at <app_base_url>
  4. To update org config later, edit .asgardeo/config-<profile>.yaml and run `asgardeo apply`
```

---

## Core Workflow

### Phase 1: CLI Setup

#### 1a — Install / locate the CLI binary

The skill bundles a pre-built CLI binary at `bin/asgardeo` (relative to this skill's directory).
Running it directly from the skill directory causes permission issues, so the skill copies it
to `/usr/local/bin/asgardeo` on first use. Once installed, all commands use the system PATH.

```bash
# Install bundled binary to /usr/local/bin if not already present
SKILL_DIR="$(dirname "$(realpath ~/.claude/skills/asgardeo-auth/SKILL.md)")"
BUNDLED_BIN="$SKILL_DIR/bin/asgardeo"

if [ -f "$BUNDLED_BIN" ] && [ ! -f "/usr/local/bin/asgardeo" ]; then
  sudo cp "$BUNDLED_BIN" /usr/local/bin/asgardeo
  sudo chmod +x /usr/local/bin/asgardeo
fi

# Verify CLI is available on PATH
ASGARDEO_BIN="$(which asgardeo 2>/dev/null)"
if [ -z "$ASGARDEO_BIN" ]; then
  echo "asgardeo CLI not found. Install it or ensure it's on PATH."
  exit 1
fi

echo "Using: $ASGARDEO_BIN"
$ASGARDEO_BIN --version
```

> **Note:** The bundled binary is macOS arm64. On other platforms, install or build the CLI manually and ensure it's on PATH — the skill will fall back to it automatically.

```bash
# 2. Check auth state
asgardeo whoami --output json 2>&1
asgardeo config list 2>/dev/null
```

Branch based on the result:

---

**State A — Already authenticated** (`whoami` returns JSON with org name)

Nothing to do. Skip to Phase 2.

---

**State B — Profile exists but session expired** (`config list` shows a profile, `whoami` fails with auth/token error)

```bash
asgardeo auth login
```

`asgardeo auth login` will either:
- Auto-authenticate using stored client credentials (silent, no user action needed)
- Or start a **device flow** — it prints a URL and a code. Tell the user:
  > "Please open this URL in your browser and enter the code shown in the terminal to complete login."
  Wait for the command to exit before continuing.

```bash
# Verify
asgardeo whoami
```

---

**State C — No profile configured** (`config list` is empty or `whoami` fails with "no profile" / "not configured")

Ask the user for:
- **Org name** — the slug of their Asgardeo organization (e.g. `myorg`)
- **M2M client ID** — from a machine-to-machine application in the Asgardeo console (used by the CLI to call the management API — NOT the app's own client ID)
- **M2M client secret** — the corresponding secret

Explain briefly if needed:
> "I need credentials for a machine-to-machine app in your Asgardeo org. These let the CLI manage your org on your behalf. Go to Asgardeo Console → Applications → New Application → M2M to create one if you don't have it."

Then:

```bash
asgardeo config create \
  --org <org_name> \
  --client-id <mgmt_client_id> \
  --client-secret <mgmt_client_secret> \
  --set-active

asgardeo auth login
```

Again, `asgardeo auth login` may trigger a device flow. If it does, prompt the user to open the URL and complete the browser step before continuing.

```bash
# Verify
asgardeo whoami
```

### Phase 2: Generate or Update the Config File

**This is the primary way to register applications and manage org resources.**

#### 2a — Determine the config file path

The active profile name comes from `asgardeo whoami` or from existing `.asgardeo/config-<profile>.yaml` files.
Default: use the org slug as the profile name → `.asgardeo/config-<org_name>.yaml`.

```bash
ls .asgardeo/config-*.yaml 2>/dev/null
```

#### 2b — Read existing config (if present)

Always read the file before modifying it. Preserve all existing entries — only add or update the relevant section.

#### 2c — Apply the schema and write the updated file

Read `schema/config-profile.yaml` for field definitions and valid values, then merge the new application entry into the `applications` list. Do not duplicate an app if one with the same `name` already exists — update it instead.

Use this field mapping when deriving values from the user's framework and intent:

| User intent | Config field | Value |
|---|---|---|
| SPA / browser app | `client_type` | `public` |
| Server-side / M2M | `grant_types` | `client_credentials` |
| Standard login | `grant_types` | `authorization_code`, `refresh_token` |
| Callback URL | `redirect_uris` | Framework default or user-provided value |
| Dev server URL | `allowed_origins` | Derived from redirect URI base (e.g. `http://localhost:5173`) |

Write the file using YAML with 4-space indentation, matching the existing file style.

Always prepend a comment block at the top of the written config file with the exact CLI commands the user needs to run next:

```yaml
# Apply this config to your Asgardeo org:
#   asgardeo apply
#
# Then retrieve the OAuth2 consumer key for SDK configuration:
#   asgardeo app list --output json                            # get the app UUID
#   asgardeo app get --app-id <app_uuid> --oidc --output json  # get clientId + clientSecret
```

#### 2d — Apply the config to Asgardeo

```bash
asgardeo apply
```

This reconciles the declared state in all `config-<profile>.yaml` files with the live org — creating or updating applications, users, and groups as needed. CORS (`allowed_origins`) is also applied at this step.

### Phase 2.5: Retrieve the OAuth2 Consumer Key

After `asgardeo apply`, retrieve the consumer key and client secret for SDK configuration.

```bash
# Get the app UUID for the registered app
asgardeo app list --output json

# Use the UUID to fetch the OAuth2 OIDC credentials
asgardeo app get --app-id <app_uuid> --oidc --output json
```

Parse from the `--oidc` output:
- `clientId` → the OAuth2 consumer key (e.g. `_lyx0w0mukGTj2zFyU7haM1euQIa`) — use this in SDK config
- `clientSecret` → the client secret

> **Important:** The `id` from `app list` is the app's internal UUID used only in CLI commands. The `clientId` from `--oidc` is the OAuth2 consumer key used in SDK config. They are different values.

In the SDK integration file (e.g. `main.tsx`, `layout.tsx`, `main.ts`), add an inline comment at the `clientId` placeholder so the user knows exactly how to retrieve it:

```ts
// Replace with your OAuth2 consumer key — retrieve it after `asgardeo apply`:
//   asgardeo app list --output json                             # get the app UUID
//   asgardeo app get --app-id <uuid> --oidc --output json       # parse clientId field
clientId: "<consumer-key-placeholder>",
```

### Phase 3: Install SDK

Based on detected framework:

```bash
# React
npm install @asgardeo/react

# Next.js
npm install @asgardeo/nextjs

# Vue 3
npm install @asgardeo/vue

# Express
npm install @asgardeo/express
```

### Phase 4: Write Integration Code

See `references/react.md`, `references/nextjs.md`, `references/vue.md`, `references/express.md`
for framework-specific patterns.

The Asgardeo base URL is always: `https://api.asgardeo.io/t/<org_name>`

---

## Config File Merge Rules

When updating an existing `.asgardeo/config-<profile>.yaml`:

1. **`org`** — never change if already set.
2. **`applications`** — match by `name`. If an entry with the same name exists, update only the fields provided. If no match, append a new entry.
3. **`users`** — match by `username`. Same merge logic.
4. **`groups`** — match by `name`. Same merge logic.
5. **Field ordering** — preserve `name` first in each entry, then optional fields in the order shown in the schema.
6. **Comments** — do not add inline comments to the written file unless the file already contains them.

---

## Framework Detection Logic

Read `package.json` dependencies and devDependencies:

| Condition | Framework | SDK |
|---|---|---|
| `"next"` present | Next.js | `@asgardeo/nextjs` |
| `"react"` present, no `"next"` | React | `@asgardeo/react` |
| `"vue"` present | Vue 3 | `@asgardeo/vue` |
| `"express"` present | Express.js | `@asgardeo/express` |
| No `package.json` | Unknown — ask user | — |

---

## Known Gotchas

### clientId is the consumer key, not the app UUID
`asgardeo app list` returns a UUID (e.g. `26ba5b0c-...`) — this is the internal identifier used only in CLI commands. The SDK `clientId` is the OAuth2 **consumer key** (e.g. `_lyx0w0mukGTj2zFyU7haM1euQIa`) retrieved via `asgardeo app get --app-id <uuid> --oidc`. Always use the consumer key in SDK configuration.

### CLI always creates confidential clients
The CLI creates apps with a `clientSecret`. Include it in the provider config (e.g. `AsgardeoProvider`), otherwise the token endpoint returns a Basic Auth challenge (browser shows a popup).

### CORS blocks all SDK calls by default
A freshly applied Asgardeo app with no `allowed_origins` will have every browser SDK request (`token`, `jwks`, `userinfo`, `scim2`) blocked by CORS. Always set `allowed_origins` in `config-<profile>.yaml` before running `asgardeo apply`.

### instanceId must be non-zero
The SDK uses `instanceId` to prefix the OAuth2 `state` parameter. If `instanceId={0}` (the default), JavaScript's falsy check skips the prefix and state validation fails silently — the callback URL is never processed. Always set `instanceId={1}`.

### Stale OIDC metadata in sessionStorage
The SDK caches OIDC discovery results in `sessionStorage`. If you change `baseUrl`, provider config, or endpoints, tell the user to clear browser site data before testing — otherwise the old cached endpoints are used and sign-in fails with confusing errors (`ERR_JWT_CLAIM_VALIDATION_FAILED iss`, 404s, etc).

### React Hooks order
All `useState` and `useEffect` calls must appear before any early returns in the component. Never place hooks after `if (isLoading) return ...` or `if (!isSignedIn) return ...`.

### User profile requires `internal_login` scope
The SDK fetches user profile via SCIM2 (`/scim2/Me`). This endpoint requires the `internal_login` scope in the access token. Without it, SCIM2 returns 401 and `useUser()` returns only org-level claims, not the user's `givenName`/`displayName`. Always include `internal_login` in scopes.

### `useUser()` profile field is `givenName` (camelCase)
The SCIM2 response is mapped to camelCase. Use `profile?.givenName`, not `profile?.given_name`.

---

## Reference Files

- `schema/config-profile.yaml` — Schema for `.asgardeo/config-<profile>.yaml` (read before generating or updating config files)
- `references/react.md` — React (Vite/CRA) integration pattern
- `references/nextjs.md` — Next.js ≥15.3 integration pattern
- `references/vue.md` — Vue 3 integration pattern
- `references/express.md` — Express.js integration pattern

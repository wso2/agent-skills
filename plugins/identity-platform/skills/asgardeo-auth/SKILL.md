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
- **The SDK `clientId` is the OAuth2 consumer key, NOT the app UUID.** `asgardeo app list` returns UUIDs. The consumer key is retrieved via `asgardeo app get --credentials`. Always use the consumer key in SDK config.
- **Browser-based apps (SPA) should use `client_type: public`** in the config file. Public clients use PKCE and don't need a `clientSecret`. Only set `client_type: confidential` for server-side apps that can securely store a secret. If `client_type` is omitted or set to `confidential`, `asgardeo app get --credentials` may show an empty client secret — use `public` for SPAs to avoid this.
- **Use the declarative config file as the source of truth for org state.** Generate or update `.asgardeo/config-<profile>.yaml` using the schema in `schema/config-profile.yaml`, then apply changes with `asgardeo apply --non-interactive`. Do not use `asgardeo app create` for apps tracked by a config file.
- When a `.asgardeo/config-<profile>.yaml` already exists, always read it first and merge new entries — never overwrite the whole file blindly.
- Always set `allowed_origins` in the config file for browser-based apps — without it, all SDK calls are blocked by CORS.
- Always include `internal_login` in scopes so the SDK can fetch the user's profile via SCIM2.
- **When an app needs user attributes in its tokens** (e.g. to render a name, gate UI on group membership, or have a backend verify identity from a JWT), add `user_attributes:` to the app entry in `.asgardeo/config-<profile>.yaml` and re-run `asgardeo apply`. Without this, the access token / id_token / `/scim2/Me` response only contains org-level claims and the user object comes back empty. Pick the minimal set the app actually reads — never blanket-add every available claim.
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

# Determine CLI auth state — possible outcomes:
#   EXIT 0 + JSON with "token_valid": true   → authenticated
#   EXIT 0 + JSON with "token_valid": false  → profile exists but session expired (silent — no error printed)
#   EXIT non-zero, "no profile" / "not configured" → no profile exists
#   EXIT non-zero, "unauthorized" / "token expired"  → session expired
asgardeo whoami --output json 2>&1

# List configured orgs (helps distinguish "no profile" from "wrong active profile")
asgardeo config list-orgs 2>/dev/null

# Detect framework from package.json if it exists
cat package.json 2>/dev/null
```

Classify the CLI state as one of:

| State | Symptom | Action needed |
|---|---|---|
| **Authenticated** | `whoami` exits 0 with `"token_valid": true` | Nothing — skip Phase 1 |
| **Session expired** | `whoami` exits non-zero (`token_valid: false` in the JSON, or an auth/token error), and `config list-orgs` shows an org | `asgardeo auth refresh` (or `asgardeo auth login`) |
| **No profile** | `whoami` fails and `config list-orgs` is empty or missing | `asgardeo config create` + `asgardeo auth login` |

> `asgardeo whoami` returns a non-zero exit code when the token is missing or expired, so scripts can gate on it directly. For M2M-configured orgs, `asgardeo auth refresh` is silent and instant; fall back to `asgardeo auth login` only if refresh fails.

Also read:
- `package.json` — framework detection (look for `next`, `react`, `vue`, `express`)
- `.asgardeo/` — check for existing `config-<profile>.yaml` files to determine current org state

### Step 2 — Present a plan

Show the user a clear plan and confirm before proceeding:

```
Here's what I'll do to add Asgardeo auth to your app:

  1. Verify the Asgardeo CLI is configured and authenticated
  2. Register the OAuth2 app in .asgardeo/config-<profile>.yaml
  3. Apply the config to Asgardeo with `asgardeo apply --non-interactive`
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
  4. To update org config later, edit .asgardeo/config-<profile>.yaml and run `asgardeo apply --non-interactive`
```

---

## Core Workflow

### Phase 1: CLI Setup

#### 1a — Install / locate the CLI binary

The skill bundles a pre-built CLI binary at `bin/asgardeo` (relative to this skill's directory).
Running it directly from the skill directory causes permission issues, so the skill copies it
to `/usr/local/bin/asgardeo` on first use. Once installed, all commands use the system PATH.

Substitute `<absolute-path-to-skill>` with the absolute directory path of this `SKILL.md` file.

```bash
# Install bundled binary to /usr/local/bin if not already present
BUNDLED_BIN="<absolute-path-to-skill>/bin/asgardeo"

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
asgardeo config list-orgs 2>/dev/null
```

Branch based on the result:

---

**State A — Already authenticated** (`whoami` returns JSON with org name)

Nothing to do. Skip to Phase 2.

---

**State B — Profile exists but session expired** (`config list-orgs` shows an org; `whoami` exits non-zero with `token_valid: false` or an auth/token error)

```bash
# For M2M-configured orgs, refresh is silent and instant
asgardeo auth refresh

# If refresh fails, fall back to a full login
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

**State C — No profile configured** (`config list-orgs` is empty or `whoami` fails with "no profile" / "not configured")

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
| Callback + post-logout (SPA) | `redirect_uris` | A single regex entry — see below |
| Callback only (server-side) | `redirect_uris` | Framework default or user-provided value |
| Dev server URL | `allowed_origins` | Derived from redirect URI base (e.g. `http://localhost:5173`) |
| Backend JWKS verification | `access_token.type` | `JWT` (default is opaque) |
| Group membership | `groups[].members` | `["DEFAULT/<username>", ...]` (userstore prefix required) |
| Show user name / email in UI | `user_attributes` | `["emailaddress", "given_name", "family_name"]` |
| Role / group-gated UI | `user_attributes` | include `"groups"` (and `"roles"` if the app reads roles) |
| Backend reads user identity from JWT | `user_attributes` + `access_token.type: JWT` | claims the API needs (e.g. `["emailaddress", "groups"]`) |

**Important:** Asgardeo rejects multiple plain `redirect_uris` entries with API error 501 (`Multiple callbacks for OAuth2 are not supported yet`). For SPAs that need both a login callback (`/callback`) **and** a post-logout redirect (the app base URL), register them as a single regex entry:

```yaml
redirect_uris:
  - regexp=(http://localhost:5173(/callback)?)
```

This single entry matches both `http://localhost:5173/callback` (used by `signIn()`) and `http://localhost:5173` (used by `signOut()` as `afterSignOutUrl`). Without this, logout fails with "OAuth Processing Error" because the post-logout redirect URI isn't registered. Adjust the host/port to match the user's dev server.

**User attributes in tokens.** If the app reads any user data — display name, email, group/role membership, or anything the backend will check from a JWT — list those claims under `user_attributes:`. Asgardeo only releases what's explicitly requested. Short names expand against the `http://wso2.org/claims/` dialect; full URIs pass through.

```yaml
applications:
  - name: my-spa
    client_type: public
    redirect_uris: [regexp=(http://localhost:5173(/callback)?)]
    allowed_origins: [http://localhost:5173]
    user_attributes:
      - emailaddress       # http://wso2.org/claims/emailaddress
      - given_name         # http://wso2.org/claims/givenname
      - family_name        # http://wso2.org/claims/lastname
      - groups             # required if the app gates UI on group membership
```

Map the user's intent to the minimal claim set before writing:
- "show the user's name" → `given_name`, `family_name` (and `emailaddress` if you also show email)
- "role/group-gated UI" → `groups` (and `roles` if the app reads roles)
- "backend verifies the JWT" → set `access_token.type: JWT` **and** list every claim the API reads
- Never copy-paste the full alias table — pick only what the app actually consumes.

Skip `user_attributes` only when the app does no user-data work at all (e.g. a pure passthrough that hands tokens to another service).

Write the file using YAML with 4-space indentation, matching the existing file style.

Always prepend a comment block at the top of the written config file with the exact CLI commands the user needs to run next:

```yaml
# Apply this config to your Asgardeo org:
#   asgardeo apply --non-interactive
#
# Then retrieve the OAuth2 consumer key for SDK configuration:
#   asgardeo app get --name "<app-name>" --credentials --output json
```

#### 2d — Preview and apply the config to Asgardeo

```bash
# Optional: preview what will change before applying
asgardeo plan --config .asgardeo/config-<profile>.yaml

# Apply everything in the config file (apps + users + groups)
asgardeo apply --config .asgardeo/config-<profile>.yaml --non-interactive
```

> Pass `--non-interactive` whenever you want to skip the Y/n confirmation prompt (CI, scripts, or any time you've already reviewed the plan). The CLI also auto-detects when stdin isn't a TTY and switches to non-interactive mode automatically — `--non-interactive` is no longer required to avoid a crash, just to skip the prompt.

`apply` reconciles the declared state with the live org — creating or updating applications, users, groups, **and group membership** as needed. CORS (`allowed_origins`) is also applied at this step. Users are created `active: true` by default and can log in immediately. Set `password:` on each user spec when running `--non-interactive`; without an explicit password the run aborts (Asgardeo's auto-generated passwords routinely fail its own complexity policy).

The `--apps`, `--users`, `--groups` flags are **filters**, not include-flags — pass them only when you want to apply a subset (e.g. `--apps` to apply applications only). The default (no filter) applies everything in the file.

### Phase 2.5: Retrieve the OAuth2 Consumer Key

After `asgardeo apply --non-interactive`, retrieve the consumer key for SDK configuration. Look up by app name directly — no need to chain `app list` + `app get`:

```bash
asgardeo app get --name "<app_name>" --credentials --output json
```

Parse from the JSON:
- `client_id` → the OAuth2 consumer key (e.g. `_lyx0w0mukGTj2zFyU7haM1euQIa`) — use this in SDK config
- `client_secret` → the client secret (only present for `confidential` apps; empty for `public` apps)

> **Important:** The `id` from `app list` is the app's internal UUID used only in CLI commands. The `client_id` from `--credentials` is the OAuth2 consumer key used in SDK config. They are different values.

In the SDK integration file (e.g. `main.tsx`, `layout.tsx`, `main.ts`), add an inline comment at the `clientId` placeholder so the user knows exactly how to retrieve it:

```ts
// Replace with your OAuth2 consumer key — retrieve it after `asgardeo apply`:
//   asgardeo app get --name "<app_name>" --credentials --output json
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
`asgardeo app list` returns a UUID (e.g. `26ba5b0c-...`) — this is the internal identifier used only in CLI commands. The SDK `clientId` is the OAuth2 **consumer key** (e.g. `_lyx0w0mukGTj2zFyU7haM1euQIa`) retrieved via `asgardeo app get --name "<app>" --credentials --output json`. Always use the consumer key in SDK configuration.

### Use `client_type: public` for SPAs
Browser-based apps (SPA) should always use `client_type: public` in the config file. Public clients use PKCE — no `clientSecret` needed in the SDK config. If you omit `client_type` or set it to `confidential`, `asgardeo app get --credentials` may show an empty client secret, and the token endpoint will return a Basic Auth challenge (browser shows a popup). Only use `confidential` for server-side apps that can securely store a secret.

### `asgardeo apply` and the `--non-interactive` flag
`asgardeo apply` prompts for a Y/n confirmation by default. The CLI auto-detects when stdin isn't a TTY (piped input, subprocesses, CI) and switches to non-interactive mode automatically — so it no longer panics in those environments. Pass `--non-interactive` explicitly when you want to skip the prompt even from a real terminal (recommended for scripted runs).

### CORS blocks all SDK calls by default
A freshly applied Asgardeo app with no `allowed_origins` will have every browser SDK request (`token`, `jwks`, `userinfo`, `scim2`) blocked by CORS. Always set `allowed_origins` in `config-<profile>.yaml` before running `asgardeo apply --non-interactive`.

### instanceId must be non-zero
The SDK uses `instanceId` to prefix the OAuth2 `state` parameter. If `instanceId={0}` (the default), JavaScript's falsy check skips the prefix and state validation fails silently — the callback URL is never processed. Always set `instanceId={1}`.

### Stale OIDC metadata in sessionStorage
The SDK caches OIDC discovery results in `sessionStorage`. If you change `baseUrl`, provider config, or endpoints, tell the user to clear browser site data before testing — otherwise the old cached endpoints are used and sign-in fails with confusing errors (`ERR_JWT_CLAIM_VALIDATION_FAILED iss`, 404s, etc).

### React Hooks order
All `useState` and `useEffect` calls must appear before any early returns in the component. Never place hooks after `if (isLoading) return ...` or `if (!isSignedIn) return ...`.

### User profile requires `internal_login` scope **and** declared `user_attributes`
The SDK fetches user profile via SCIM2 (`/scim2/Me`). Two things must be true for it to return anything useful:
1. The access token must include the `internal_login` scope — otherwise SCIM2 returns 401.
2. The Asgardeo app must declare the claims it wants released under `user_attributes:` in `config-<profile>.yaml`. Asgardeo only releases what's explicitly requested; without this `useUser()` returns only org-level claims even when the SCIM call succeeds.

Always include `internal_login` in scopes **and** list the claims the app reads (e.g. `["emailaddress", "given_name", "family_name", "groups"]`) under `user_attributes` before running `asgardeo apply`.

### `useUser()` profile field is `givenName` (camelCase)
The SCIM2 response is mapped to camelCase. Use `profile?.givenName`, not `profile?.given_name`.

### Asgardeo rejects multiple plain `redirect_uris`
Asgardeo's app provisioning API returns error 501 "Multiple callbacks for OAuth2 are not supported yet" when more than one plain URI is supplied. Register a single regex entry instead — e.g. `regexp=(http://localhost:5173(/callback)?)` — which covers both the login callback path and the bare origin used as the post-logout URL.

### Logout fails if `afterSignOutUrl` isn't a registered redirect URI
Asgardeo enforces OIDC's rule that `post_logout_redirect_uri` must match a registered redirect URI on the app. If the SDK is configured with `afterSignOutUrl="http://localhost:5173"` but only `http://localhost:5173/callback` is registered, logout fails with "OAuth Processing Error". The regex pattern above prevents this — both URIs match the single registered entry.

### Re-auth when `whoami` fails
`asgardeo whoami` exits non-zero when the token is missing or expired (and the JSON shows `"token_valid": false`). On a non-zero exit, run `asgardeo auth refresh` (silent, M2M-only); fall back to `asgardeo auth login` if refresh fails.

### SCIM2 group display names are prefixed with the userstore
SCIM2 returns group names as `DEFAULT/admin` (or `<userstore>/<name>`), not bare `admin`. A naive `groups.includes("admin")` check silently fails — the user logs in but role-gated UI never appears. Strip everything before the last `/` when comparing:

```ts
const groupNames = (groups ?? []).map((g) => g.display.split("/").pop());
if (groupNames.includes("admin")) { /* ... */ }
```

### Asgardeo issues opaque access tokens by default — set `access_token.type: JWT` for backend verification
Out of the box, Asgardeo issues opaque (UUID-like) access tokens. Backends that try to verify tokens via JWKS will reject every request with `401 Invalid or expired token`. Frontend-only flows (SPA + Asgardeo's userinfo/SCIM2) work with opaque tokens, but the moment a backend needs to verify the token locally, JWT is required.

Whenever the user mentions a backend, API gateway, Express integration, or token validation, set the access token type to JWT. **The key is nested under `access_token:` — `access_token_type: JWT` (flat) is silently ignored as an unknown field, so the token type stays `Default` and the agent thinks the fix landed when it didn't:**

```yaml
# In .asgardeo/config-<profile>.yaml
applications:
  - name: MyApp
    client_type: public
    access_token:                # Optional block. Omit fields for Asgardeo defaults.
      type: JWT                  # Default | JWT — opt into JWT for JWKS verification
    redirect_uris:
      - regexp=(http://localhost:5173(/callback)?)
```

Or via CLI flags directly:

```bash
asgardeo app create --name "MyApp" --public --access-token-type JWT ...
asgardeo app update --name "MyApp" --access-token-type JWT
```

Verify the live state with `asgardeo app get --name "MyApp"` — there's no row for the token type yet, so cross-check via `ASGARDEO_DEBUG=1 asgardeo app get --name "MyApp"` and look for `"accessToken":{"type":"JWT"...}` in the response body.

### `useUser()` may return an empty profile — use `/oauth2/userinfo` first, SCIM2 second
First confirm the app has `user_attributes` declared in `config-<profile>.yaml` and `asgardeo apply` was run — without that, `useUser()` returns only org-level claims no matter what scope is set, because Asgardeo isn't releasing those claims to begin with. (See "User profile requires `internal_login` scope **and** declared `user_attributes`" above.)

If `user_attributes` is correctly set and the profile is still empty, two real cases are in play:

1. **SDK bug** — some `@asgardeo/react` versions (e.g. 0.23.3) don't surface OIDC claims into `useUser().profile` even when the access token clearly contains them.
2. **Federated / JIT-provisioned users (Google, GitHub, etc.)** — the SCIM2 user record often has empty `name.givenName` / `familyName` for these users because the name lives in the OIDC claims released into the token, not in the SCIM profile. A direct `/scim2/Me` call returns blanks, so the historical "SCIM2 fallback" pattern doesn't help here.

**Use `/oauth2/userinfo` as the primary fallback** — it respects the app's `user_attributes` and works for both local and federated users. Keep SCIM2 as a secondary fallback only:

```ts
const { getAccessToken } = useAsgardeo();
const token = await getAccessToken();
const headers = { Authorization: `Bearer ${token}` };

// Primary: OIDC userinfo — works for local AND federated users
const userinfo = await fetch(`${baseUrl}/oauth2/userinfo`, { headers }).then(r => r.ok ? r.json() : null);

// Secondary: SCIM2 /Me — for local users when userinfo doesn't help
const scim = await fetch(`${baseUrl}/scim2/Me`, { headers }).then(r => r.ok ? r.json() : null);

const displayName =
  profile?.name?.givenName ||
  userinfo?.given_name || userinfo?.name ||
  scim?.name?.givenName || scim?.userName ||
  profile?.username || userinfo?.email || "User";
```

Fallback chain: `useUser() → /oauth2/userinfo → /scim2/Me → username/email → "User"`. See `references/react.md` section 5 for a complete component example.

---

## Reference Files

- `schema/config-profile.yaml` — Schema for `.asgardeo/config-<profile>.yaml` (read before generating or updating config files)
- `references/react.md` — React (Vite/CRA) integration pattern
- `references/nextjs.md` — Next.js ≥15.3 integration pattern
- `references/vue.md` — Vue 3 integration pattern
- `references/express.md` — Express.js integration pattern

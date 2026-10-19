# `asg` CLI — command map

Use this to route a user's intent to the right command. It lists what exists, not every flag —
**always confirm exact flags at runtime** with `asg <command> --help` (the CLI self-documents, so
its help is the source of truth even as the tool evolves). Don't guess flag names from this map.
`asg docs generate --directory <dir>` writes the full reference once, if you need more.

## Command pattern

```bash
asg <resource> <action> [flags]
```

## Resource domains

| Resource | Actions | Notes |
|----------|---------|-------|
| `login` / `logout` / `status` | — | See `auth.md`. User runs login; agent runs status. |
| `apps` | `create`, `list`, `view`, `update`, `delete`, `filter`, `settings`, `apis`, `claims`, `protocol`, `export` | Applications. `create` supports types `oidc`, `spa`, `mobile`, `mcp`, `saml`. `apis add/list/remove` manages which API resources the app may request scopes from; `claims` views/updates requested user attributes; `protocol view/update` manages OIDC/SAML settings (redirect URIs, token type, grant types). See `sdk-integration.md`. |
| `users` | `create`, `view`, `update`, `delete`, `filter`, `settings` | Org users. |
| `groups` | `create`, `view`, `update`, `delete`, `filter`, `members`, `roles`, `settings` | `members add/list/remove`; `roles list`. |
| `roles` | `create`, `view`, `update`, `delete`, `filter`, `users`, `groups`, `settings` | `users add/list/remove`, `groups add/list/remove`. |
| `idps` | `list`, `view`, `delete` | Identity providers (read/delete only via CLI). |
| `apis` | `create`, `view`, `update`, `delete`, `filter`, `scopes`, `settings` | API resources. `apis scopes add/list/delete`. |
| `scopes` | `filter` | Filter API-resource scopes across the org. |
| `branding` | `create`, `view`, `update`, `delete` | Org branding preferences. |
| `orgs` | `create`, `view`, `update`, `delete`, `filter`, `self`, `settings` | Organizations. `orgs self` = current org from the token. |
| `agents` | `create`, `view`, `update`, `delete`, `filter` | Asgardeo agents. |
| `api` | — | Raw authenticated API request — the escape hatch for anything without a verb. Syntax: `asg api "/api/server/v1/<path>" -X GET`, add `-b '<json>'` or `-b @file.json` for a body, `-q key=value` for query params, `-r` for compact JSON, `-o <file>.json` to save it. Paths starting `/api/`, `/scim2/`, `/scim/` pass through as-is. Which API to call: `management-apis.md`. |
| `tui` | — | Interactive terminal dashboard. Must be logged in. The agent should not launch it — point the user to `asg tui` if they want interactivity. |
| `docs` | `generate`, `view` | `asg docs generate --directory <dir>` writes full markdown docs; `asg docs view --command "apps view"` prints one. |

## Create output — identifiers come back from the create call

Without `--format`, the identifiers are printed as plain lines:

```bash
asg apps create --name "store-frontend" --type spa --redirect-uri "http://localhost:5173" -N -y
# SUCCESS: Application store-frontend (spa) created successfully
# ID: <app-id>
# Client ID: <client-id>
```

With `--format json|yaml`, the full created object goes to stdout instead:

```bash
CLIENT_ID=$(asg apps create --name "store-frontend" --type spa \
  --redirect-uri "http://localhost:5173" -N -y --format json | jq -r .clientId)
```

Every resource returns `id`; applications, and agents created with `--allow-user-login`, also return `clientId`.

## Gotchas when running unattended

- **Pass `-N` on every command you run.** It stops input prompts, so a missing flag fails instead of
  waiting on a TTY. It also skips confirmations: under `-N` a `delete` goes through without asking, so
  get the user's OK before you run one. Add `-y` on mutating commands as the scripts do. `-v` gives
  the detailed log when diagnosing.
- **`filter` needs `-N`.** Without `-N` (or `--no-color`) every `filter` opens a full-screen terminal view,
  even with `--format json`, and an unattended run hangs. An empty result prints
  `Filter completed! 0 … found` and no JSON.
- **Parsing JSON.** With `--format json|yaml` **and `-N`**, stdout carries only the payload —
  progress and success messages go to stderr — so `| jq` and `> file.json` work directly. Without
  `-N` the spinner writes to stdout and the JSON will not parse. **Capture stdout only; never `2>&1`
  when you intend to parse.**
- **`list` is deprecated on `apis`, `agents`, `roles`, `users` and `groups` — use `filter`.** `list`
  fetches everything and warns; `filter` is where narrowing lives and is what these resources are
  meant to be read with. `filter` returns 10 results unless `-c <n>` asks for more. Two filters worth knowing:
  - your own APIs, without Asgardeo's ~200 built-in resources: `asg apis filter -q "type eq BUSINESS" -N`
  - an agent by name: `asg agents filter -q 'name eq "support-assistant"' -N`

  `apps list` is not deprecated. A role's members: `asg roles users list --id <roleId>`.
- **`--edit` uses `path=value`** (dot-separated path, `=` separator, `@file.json` for complex values):
  `asg apps update -i <id> --edit "name=NewName" -y`. Colons (`name:NewName`) are rejected.
- **File-based update works unattended** — `asg <resource> update -i <id> --file <prepared.json> -N`
  imports the prepared JSON directly and leaves the file untouched. **Always pass `-N` with
  `--file`**: without it the CLI exports over that path first. These are full-replace updates, so edit
  a copy of the current configuration rather than writing a partial file. `apis update` has no
  `--file`.
- **Where the file comes from differs by resource.** Applications are the only resource with a
  declarative representation on the server:
  - **Apps** — `asg apps export -i <id> --file app.json`. Its output is *not* `apps view` JSON: the
    keys and structure differ (`applicationName` vs `name`, `claimConfig` vs `claimConfiguration`,
    protocol config inlined rather than linked). Feeding `apps view` output to `apps update --file`
    is refused by the CLI: "the file has no applicationName". Secrets are excluded from the export.
  - **Everything else** — there is no `export` command, because there is no export endpoint.
    `asg <resource> view -i <id> -N --format json > config.json` already produces what
    `update --file` accepts.
  For a targeted app change, `--edit "path=@file.json"` is simpler than a whole round trip.
- **`apps update --file` must match the file's application.** The server identifies the target by
  the `applicationName` inside the file, not by `-i`. The CLI now rejects a mismatch rather than
  updating the wrong app, so export the app you intend to change — don't reuse another app's file.
- **Role user/group JSON shapes** — `--users`/`--groups` take a JSON *array*:
  `--users '[{"value":"<user-id>"}]'`. For single IDs prefer `-u <user-id>` / `-g <group-id>`.


## Protocol settings vs application settings

An application's settings live in **two** places, and which one a field belongs to decides the
command. `apps update --edit` reaches the application object only; a protocol field returns a
generic 400 whatever path you spell it with.

| Application object → `asg apps update --edit` | Protocol resource → `asg apps protocol update --edit` |
|---|---|
| `name`, `description`, `accessUrl` | `callbackURLs`, `allowedOrigins` (redirect URIs) |
| `advancedConfigurations.*` (consent, discoverability) | `accessToken.type` (JWT vs opaque), token expiry |
| `claimConfiguration.*` (requested claims) | `grantTypes`, `pkce.*`, `refreshToken.*`, `publicClient` |
| `authenticationSequence.*` (login flow) | `idToken.*`, `logout.*`, `subject.*` |

```bash
asg apps protocol view --id <appId> -N                            # everything editable, secret masked
asg apps protocol update --id <appId> --edit "accessToken.type=JWT" -N -y
asg apps protocol update --id <appId> --edit 'callbackURLs=["http://localhost:3000"]' -N -y
```

Values keep their JSON type, so `--edit "pkce.mandatory=false"` sends a boolean and
`--edit "refreshToken.expiryInSeconds=604800"` a number. Fields you do not name keep their values:
the command fetches the resource, merges the edit and writes it back (the endpoint has no PATCH, so
doing this by hand means round-tripping every field yourself). `--protocol saml` targets a SAML
app's resource instead — run `protocol view` first to see its field names.

Redirect URIs can also be set at creation with `--redirect-uri`, and the token format with
`--access-token-type jwt|opaque`.


## App gotchas

- **Never add `--format` to `apps protocol view`.** Without it the client secret prints as `***`;
  with `--format json` it prints in full. Plain `-N` output is the same JSON after a `SUCCESS` line.
- **Redirect URIs are one array.** `apps protocol update --edit 'callbackURLs=[…]'` replaces the
  whole list, so adding a production URL later means restating the dev URL in the same command or
  silently losing it. Register every URL the user knows about at creation.
- **CORS at the token exchange, not the redirect.** Only `--type spa` gets `allowedOrigins` from its
  redirect URIs; other types are created with none. If login fails on CORS after the redirect
  succeeded, check `allowedOrigins` in `asg apps protocol view`, not just `callbackURLs`.
- **A test user needs a password now.** `asg users create` sets one only with
  `--password <value> --set-password`; without the flag Asgardeo emails the person a set-password
  link, which never arrives for a test address. Generate a strong password and pass it.
- **The email is the username.** `asg users create` has no `--username`; unattended it needs
  `--user-store DEFAULT --email <addr> --first-name <n> --last-name <n>` plus the password flags.

## Console links — let the user see what changed

After creating or changing something, give the user its Console URL so they can look at it. The
pattern is stable:

```
https://console.asgardeo.io/t/<org>/app/<resource>/<id>
```

`<org>` is the last segment of the Base URL in `asg status`; `<resource>` is `applications`, `users`, `groups`, `roles`, or
`organizations`. An API resource adds its type before the ID:
`…/app/api-resources/<type>/<id>`, with `<type>` the `type` field from `asg apis view`. Applications also take a tab fragment —
`…/applications/<id>#tab=protocol` (also `general`, `user-attributes`, `sign-in-method`,
`api-authorization`, `roles`, `advanced`, `info`), which is useful for pointing at the exact screen
a Console-only step needs.

`asg <resource> settings` builds the same URL and opens a browser, but it needs an interactive
terminal — construct the link and let the user click it instead.

(Self-hosted Identity Server: `<identity-server-url>/t/<org>/console/<resource>/<id>`.)

## When a command fails

**Read the error, then the log.** The terminal prints the innermost cause under `ERROR: Failed to …`;
the full chain is in the CLI log (macOS `~/Library/Application Support/asgardeo-cli/logs/asgardeo-cli.log`; Linux typically
`~/.config/asgardeo-cli/logs/`): the API error is recorded as-is (`code`, `message`, `description`,
`traceId`; `detail` for SCIM). Re-running with `-v` shows the same inline. Keep the `traceId` — it's
what Asgardeo support needs if you escalate.

- **"Session has expired"** — the silent token refresh failed (refresh token expired or revoked).
  The one failure where the fix is a fresh `asg login` by the user.
- **403 / "Forbidden request. You do not have permission to perform this action."** — the signed-in
  user's role lacks that management permission. **Re-login never fixes this** — an admin grants the
  role/permission, *then* the user logs in again.
- **"server returned an HTML error page (N bytes, omitted)"** — the response was not from the API
  (a proxy or edge block, or a wrong base URL). Check the Base URL in `asg status`; if it is right,
  escalate to Asgardeo support with the endpoint and time.
- **Backend can't read the token / scopes look empty** — the app is issuing **opaque** access
  tokens (the default). Decoding one as a JWT fails and every scope check comes back empty. Switch
  the app to JWT before debugging further: `authorize-app.md` step 5.
- **"CLI access is disabled for this organization"** — see `auth.md`; an administrator enables it
  once in the Console, then the user logs in again.
- **Login won't complete** — wrong org name (must be the root org name), or the browser sign-in
  wasn't finished; if no browser could open, the terminal printed the URL and code to use manually.
  Verify with `asg status` before retrying.

Still stuck: fetch the specific docs page, not the tree — guides
`https://wso2.com/identity-platform/docs/guides.md`, APIs `https://wso2.com/identity-platform/docs/apis.md`.

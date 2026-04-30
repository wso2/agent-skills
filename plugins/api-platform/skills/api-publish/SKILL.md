---
name: api-publish
description: >
  Use this skill to set up the WSO2 API Platform Gateway, expose backend services
  as managed APIs, and manage APIs with the ap CLI. Trigger whenever the user
  mentions WSO2 gateway, "ap CLI", "API Platform Gateway", exposing a service
  through WSO2, deploying an API to WSO2, or managing APIs with WSO2 tooling —
  even if they don't say "WSO2" explicitly and just describe wanting an API gateway
  on Docker with CLI management. Also trigger when the user wants to add rate
  limiting, authentication, or header policies to a gateway-managed API.
---

# WSO2 API Platform Gateway

You are an agent that sets up and manages the WSO2 API Platform Gateway end-to-end, helping developers expose their backend services as managed APIs using the `ap` CLI.

The user likely has a service already running (e.g. at `localhost:8081`) and wants it accessible as a gateway-managed API. They understand HTTP but may be new to API gateways.

**Your approach:** Show a short plan before starting. Use ✓ for success, ✗ for failure. When something fails, diagnose the likely cause and propose a fix before trying another approach.

---

## Reference files

Read these when needed — don't load all of them upfront:
- `references/ap-cli-reference.md` — full `ap` CLI command reference (read when you need a command you're not sure about)
- `references/api-yaml-examples.md` — annotated RestApi YAML examples with policies (read before generating any YAML)
- `references/docker-networking.md` — Docker networking solutions (read before setting the upstream URL)

## External docs (fetch when needed)

Docs live on two release-line branches in `wso2/api-platform`. Use these — don't fall back to `main`:
- Gateway and REST-API docs → `gw-docs-1.1.x` (gateway 1.1.x release line)
- CLI docs → `ap-docs-0.8.x` (ap CLI 0.8.x release line)

- **Gateway docs**: `https://github.com/wso2/api-platform/tree/gw-docs-1.1.x/docs/gateway` — covers Kubernetes, observability, resiliency, analytics, policies, immutable gateway, policy languages and runtimes
- **Gateway REST API docs**: `https://github.com/wso2/api-platform/tree/gw-docs-1.1.x/docs/rest-apis/gateway` — covers all admin REST API endpoints (auth, API key management, secrets, certificates)
- **Individual REST API doc files**: `https://raw.githubusercontent.com/wso2/api-platform/gw-docs-1.1.x/docs/rest-apis/gateway/<filename>.md` — fetch the specific file when you need endpoint details (e.g. `rest-api-management.md`, `authentication.md`, `secrets-management.md`)
- **CLI docs**: `https://github.com/wso2/api-platform/tree/ap-docs-0.8.x/docs/cli` — `reference.md`, `quick-start-guide.md`, `customizing-gateway-policies.md`

---

## Phase 1 — Setup

Before doing anything, show the user a short, outcome-oriented plan tailored to what they've said. If they mentioned a specific service to expose, include deploying and testing it. If they only want the gateway set up, keep it to setup. The goal is to tell the user what they'll end up with, not list internal checks.

Example when the user wants to expose a service:
```
I'll set up the WSO2 API Platform Gateway and expose your service.
Here's what I'll do:
✦ Install the ap CLI
✦ Install and start the gateway
✦ Connect the CLI to the gateway
✦ Deploy your API
✦ Test it end to end
```

Example when the user just wants the gateway running:
```
I'll get the WSO2 API Platform Gateway running for you.
Here's what I'll do:
✦ Install the ap CLI
✦ Install and start the gateway
✦ Connect and verify everything is healthy
```

Then work through these steps, running commands and reporting results:

**Step 1 — Check and install the `ap` CLI**

```bash
ap --help
```

If `ap` is not found: ask the user whether they want to install it themselves or have you do it.

> "`ap` CLI isn't installed. Would you like me to install it for you, or would you prefer to do it yourself?"

**If they want to do it themselves (Path A):**
Point them to https://github.com/wso2/api-platform/releases/tag/ap%2Fv0.8.0 — tell them to download the zip for their platform, extract it, and add `ap` to their PATH. Wait for them to confirm, then verify with `ap --help` before continuing.

**If they want you to install it (Path B):**
Detect the platform, download to `~/Downloads`, extract, move only the binary to `~/.local/bin`, clean up, and add to PATH:
```bash
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
[ "$ARCH" = "x86_64" ] && ARCH="amd64"
[ "$ARCH" = "aarch64" ] && ARCH="arm64"

mkdir -p "$HOME/.local/bin"
curl -Lo "$HOME/Downloads/ap.zip" \
  "https://github.com/wso2/api-platform/releases/download/ap/v0.8.0/ap-${OS}-${ARCH}-v0.8.0.zip"
unzip -o "$HOME/Downloads/ap.zip" -d "$HOME/Downloads/ap-install"
AP_BIN=$(find "$HOME/Downloads/ap-install" -type f -name "ap" | head -1)
mv "$AP_BIN" "$HOME/.local/bin/ap"
chmod +x "$HOME/.local/bin/ap"
rm -rf "$HOME/Downloads/ap.zip" "$HOME/Downloads/ap-install"
SHELL_RC="$HOME/.bashrc"
[[ "$SHELL" == */zsh ]] && SHELL_RC="$HOME/.zshrc"
if grep -q '\.local/bin' "$SHELL_RC" 2>/dev/null; then
  echo "PATH already configured in $SHELL_RC"
elif echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"; then
  echo "Added to $SHELL_RC"
else
  echo "WARN: could not update $SHELL_RC"
fi
```
Verify immediately:
```bash
ap --help
```

If this succeeds, continue to Step 2.

> **Note for agent:** From this point on, always invoke `ap` by its bare name — never the full path `~/.local/bin/ap`. The Bash tool environment already has `~/.local/bin` on PATH.

If `ap` is not found, tell the user: "`~/.local/bin` isn't on your current PATH yet. Please run `source ~/.zshrc` (or `source ~/.bashrc`), or open a new terminal, then confirm here." Wait for confirmation, then re-run `ap --help` before continuing.

If the install script output contains `WARN: could not update`, also tell the user: "I couldn't update your shell profile automatically. Add this line to your `~/.zshrc` or `~/.bashrc` manually before sourcing it:
```
export PATH="$HOME/.local/bin:$PATH"
```"

**Step 2 — Detect existing gateway**

Silently check if the gateway controller is running:
```bash
curl -s --max-time 3 http://localhost:9094/api/admin/v0.9/health
```

**If the controller responds healthy (platform is up):**
Run `ap gateway list` to check what gateways are registered.

- **Gateways are listed:** Tell the user what was found and ask: "I found gateways already configured. Would you like to use one of these, or add a new gateway?"
  - Use existing → skip Steps 3 & 4, go to Step 5
  - Add new → go to Step 4

- **Returns "No gateways configured":** Tell the user: "The API platform is running locally. I'll add a gateway so we can start deploying APIs." Then proceed directly to Step 4.

**If the health check fails (platform not running):**
Ask: "Are you connecting to an existing gateway (e.g. a team or cloud server), or would you like a fresh local installation?"
- If remote: ask for the server URL and credentials, then skip Step 3 and go to Step 4
- If fresh local install: continue to Step 3

**Step 3 — Check Docker and set up the gateway (local only)**

```bash
docker --version
```

Then detect which Compose variant is available and store the working one:
```bash
if docker compose version &>/dev/null; then
  COMPOSE="docker compose"
elif docker-compose version &>/dev/null; then
  COMPOSE="docker-compose"
else
  echo "Docker Compose not found"
fi
```

If neither works, stop and tell the user: "Docker Compose is required. Please install Docker Desktop (or Rancher Desktop / Colima / Docker Engine + Compose plugin) and try again."

Use `$COMPOSE` for all subsequent compose commands.

Choose the extraction directory. We don't install the gateway into the user's working directory — we extract the release zip to a stable, versioned location under `$HOME` so successive runs find it and the user's project tree stays clean:

```bash
GW_VERSION="1.1.0"
GW_PARENT="$HOME/wso2-api-gateway"
GW_DIR="$GW_PARENT/v$GW_VERSION"
```

**If `$GW_DIR` already exists:** don't prompt. Tell the user *"Found an existing gateway extraction at `~/wso2-api-gateway/v1.1.0/` — reusing it. If you want a fresh copy, ask me and I'll remove that directory and re-extract."* Then skip the download/unzip block and go straight to the compose-up block.

**Download and extract** (skip if reusing an existing extraction):
```bash
mkdir -p "$GW_PARENT"
curl -L -o "$HOME/Downloads/wso2apip-api-gateway-$GW_VERSION.zip" \
  "https://github.com/wso2/api-platform/releases/download/gateway/v$GW_VERSION/wso2apip-api-gateway-$GW_VERSION.zip"
unzip -q "$HOME/Downloads/wso2apip-api-gateway-$GW_VERSION.zip" -d "$GW_PARENT"
rm "$HOME/Downloads/wso2apip-api-gateway-$GW_VERSION.zip"
mv "$GW_PARENT/wso2apip-api-gateway-$GW_VERSION" "$GW_DIR"
```

**Bring up the stack** (always run, whether reusing or freshly extracted — `compose up -d` is idempotent). The `cd` is required because the compose file uses relative paths for its volume mounts:
```bash
cd "$GW_DIR"
$COMPOSE -p gateway up -d
```

Tell the user: *"Gateway extracted at `~/wso2-api-gateway/v1.1.0/`. The Docker Compose project name is `gateway` — to stop it later: `cd ~/wso2-api-gateway/v1.1.0 && docker compose -p gateway down`."*

Wait a few seconds, then verify: `curl -s http://localhost:9094/api/admin/v0.9/health`

**Step 4 — Connect the ap CLI**

Format:
```
ap gateway add --display-name <name> --server <server-url> --admin-server <admin-server-url> [--auth <none|basic|bearer>]
```

`--admin-server` is required — without it, `ap gateway health` in Step 5 fails.

For a local Docker setup with default credentials (admin/admin):
```bash
ap gateway add --display-name dev \
  --server http://localhost:9090 \
  --admin-server http://localhost:9094 \
  --auth basic --username admin --password admin
```

For a remote or custom-credential server, ask the user for both the `--server` and `--admin-server` URLs (and credentials) before running.

**Step 5 — Verify gateway health**

```bash
ap gateway health
```

If healthy, report ✓ and move to Phase 2.

---

## Phase 2 — Expose an API

Before starting, show the user a brief plan:
```
Here's what I'll do to expose your API:
✦ Gather your service details
✦ Create the API resource file
✦ Publish it to the gateway
✦ Test the live endpoint
```

**Gather what you need — but don't ask for what you already have:**

First ask: Do you have an OpenAPI spec for your service?

- **If yes:** ask them to share it (file path or paste it). Once received, offer:

  > "Would you like to assess this spec before publishing?
  > - **Assess first** — checks for AI agent readiness, security, and design quality so you can fix issues before the API goes live
  > - **Publish now** — deploy immediately; you can always run the assessment separately later"

  **If assess first:**
  Follow the api-readiness-assessment skill flow — it will confirm which checks to run based on what the user said, or ask if unclear. After assessment (with or without fixes applied), ask:
  > "Ready to continue — shall I generate the publishing YAML now?"
  If fixes were applied to the spec, re-read the file before extracting operations — the spec has been updated in place.

  **If publish now:**
  Extract the backend URL, context path, and operations from the spec. Skip asking about URL and endpoints separately.

- **If no:** ask for the backend URL and list of endpoints (method + path).

Then ask separately: Should this API be public (no auth required) or require authentication?

**Before generating YAML — handle Docker networking:**

Read `references/docker-networking.md`. The upstream URL in the YAML cannot use `localhost` because the gateway runs inside Docker. Detect the actual host IP and use it.

**Generate the RestApi YAML:**

Read `references/api-yaml-examples.md` for examples. Key rules:
- `metadata.name` must be unique, lowercase alphanumerics + `-` + `.` (e.g., `my-service-v1.0`)
- `context` must use `$version` placeholder (e.g., `/myservice/$version`)
- `upstream.main.url` must use the real host IP, not `localhost`
- **Check for a backend base path before setting `upstream.main.url`** — the gateway strips the context prefix and forwards only the operation path to the upstream. If the backend mounts its routes under a base path, include it in the upstream URL, otherwise the gateway will forward to the wrong path and get a 404.

  ```yaml
  # Backend serves routes under /restaurantInfo on port 8181
  url: http://192.168.1.46:8181/restaurantInfo   # correct — gateway appends /restaurants → 200
  url: http://192.168.1.46:8181                  # wrong  — gateway appends /restaurants → 404
  ```
- Add policies only if the user asked for them

Write the YAML to a file named `<service-name>-api.yaml` in the current directory.

**Deploy and verify:**

```bash
ap gateway apply --file <service-name>-api.yaml
ap gateway rest-api list
```

**Test the live endpoint:**

```bash
curl http://localhost:8080/<context>/v1.0/<first-endpoint-path>
```

**Report the result** — show the full URL, e.g.:
```
✓ Your API is live:
  GET http://localhost:8080/myservice/v1.0/users
  POST http://localhost:8080/myservice/v1.0/users
```

---

## Phase 3 — What's next?

After Phase 2 succeeds, ask the user what they'd like to do:

> "Your API is live. What would you like to do next?
>
> → [Test]    Verify the API is working
> → [Manage]  Add authentication, rate limiting, or other configuration"

---

### If the user chooses Test

Help the user verify their API using the live endpoints confirmed in Phase 2.

Provide ready-to-run curl commands for the key endpoints, e.g.:

```bash
# List resource
curl -s http://localhost:8080/<context>/v1.0/<collection> | jq

# Get single resource
curl -s http://localhost:8080/<context>/v1.0/<collection>/<id> | jq
```

Walk through what a successful response looks like (status code, shape of the response body). If anything fails, diagnose using `ap gateway rest-api get` to check the deployed spec, and check Docker logs if the gateway is running locally.

After testing, ask:

> "Everything looking good? Would you like to manage the API next (add auth, rate limiting, etc.)?"

---

### If the user chooses Manage

Show a dynamic menu scoped to this API. Only show options not yet applied in this session:

```
What would you like to configure?
→ [Secure]    Add authentication          ← omit if auth policy already applied
→ [Protect]   Add rate limiting           ← omit if rate limiting already applied
→ [Enhance]   Add custom headers or other enhancements
```

**Add headers (set-headers policy)** — read `references/api-yaml-examples.md` for the set-headers example. The confirmed policy name is `set-headers` version `v1`.

**Authentication, rate limiting, guardrails, transforms, interception** — fetch the **PolicyHub catalog** and follow the link to the policy you need:

`https://raw.githubusercontent.com/wso2/gateway-controllers/main/docs/README.md`

This is an auto-generated table of every available policy with a one-line description and a **direct, resolved link** to its markdown reference (params, YAML examples, defaults). The catalog is the source of truth — don't crawl `/contents/docs/<policy>/<version>/docs/...` to discover filenames. They're inconsistent (`api-key-auth/v1.0/docs/apikey-authentication.md` drops a hyphen; `regex-guardrail/v1.0/docs/regex.md` is truncated) and the catalog has them resolved.

Workflow:
1. Fetch the catalog above. Find the row for what the user wants.
2. Follow the link in that row to the policy's markdown. Use its YAML and `params` to write the policy block in the RestApi spec.
3. The policy version is the `vX.Y` segment in the link path (e.g., `/api-key-auth/v1.0/...`). Use that as `version:` in your YAML.

For the meta-question of how policies attach to a RestApi (`build.yaml` shape) or how to author a custom policy in Go or Python, see the 1.1 docs — only fetch these if the user is building their own policy, not when applying an existing one:
- Policy customization model: `https://raw.githubusercontent.com/wso2/api-platform/ap-docs-0.8.x/docs/cli/customizing-gateway-policies.md`
- Runtime support: `https://raw.githubusercontent.com/wso2/api-platform/gw-docs-1.1.x/docs/gateway/policy-languages-and-runtimes.md`

### Post-deployment steps for `api-key-auth`

There is **no `ap` CLI command** for API key management — don't waste time on `ap gateway --help` or `ap gateway rest-api --help`. Call the management REST API on port 9090 directly.

Get the API's `id` first (it's the `metadata.name` of the deployed RestApi, e.g. `reading-list-api-v1.0`), then:

```bash
# Generate a new API key
curl -X POST http://localhost:9090/api/management/v0.9/rest-apis/<id>/api-keys \
  -u admin:admin \
  -H 'Content-Type: application/json' \
  -d '{"name": "<key-name>"}'
```

The response contains an `apiKey.apiKey` field — a string starting with `apip_`. Hand it to the user; the gateway won't show it again. Callers send it as `Authorization: Bearer <key>` (or whatever the `api-key-auth` policy params specify).

Other API-key operations (list / regenerate / update / delete) follow the same `/{id}/api-keys[...]` pattern — section anchors in the source doc:
- List: `#get-the-list-of-api-keys-for-an-api`
- Regenerate: `#regenerate-an-api-key`
- Update API key with new regenerated value: `#update-an-api-key-with-a-new-regenerated-value`
- Revoke API key: `#revoke-an-api-key`

Source (1000+ lines — jump to the anchor, don't read top-to-bottom):
`https://raw.githubusercontent.com/wso2/api-platform/gw-docs-1.1.x/docs/rest-apis/gateway/rest-api-management.md`

---

### Gateway ports (local Docker)
| Port | Purpose |
|------|---------|
| 9090 | Gateway-Controller REST API — `ap gateway` `--server`, REST API deployments (`POST /api/management/v0.9/rest-apis`) |
| 9094 | Gateway-Controller Admin — `ap gateway` `--admin-server`, controller health (`GET /api/admin/v0.9/health`); backs `ap gateway health` |
| 8080 | Runtime HTTP — app traffic goes here |
| 8443 | Runtime HTTPS |

### Short flag aliases
`--display-name` = `-n` · `--server` = `-s` · `--output` = `-o` · `--file` = `-f` · `--version` = `-v`

### Auth credentials
- Inline: `ap gateway add --auth basic --username <u> --password <p>`
- Via env (takes precedence over stored config): `WSO2AP_GW_USERNAME` / `WSO2AP_GW_PASSWORD`
- Bearer token: `WSO2AP_GW_TOKEN`

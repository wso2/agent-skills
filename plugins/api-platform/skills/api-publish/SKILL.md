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

Bundled scripts (invoke with `bash` or `node` against the absolute path — keeps the user's permission prompt to one line instead of pasting the full body):
- `scripts/install-ap-cli.sh` — installs the ap CLI release zip into `~/.local/bin` and ensures PATH (Step 1, Path B)
- `scripts/setup-gateway.sh` — extracts the gateway release to `~/wso2-api-gateway/v<version>/` and runs `docker compose up -d` (Step 3)
- `scripts/init-local-cli-config.js` — writes `~/.wso2ap/config.yaml` with a `dev` entry pointing at the local gateway, using the gateway's documented public defaults (Step 4, fresh-local branch)

## External docs (fetch when needed)

Docs live on two release-line branches in `wso2/api-platform`. Use these — don't fall back to `main`:
- Gateway and REST-API docs → `gw-docs-1.1.x` (gateway 1.1.x release line)
- CLI docs → `ap-docs-0.8.x` (ap CLI 0.8.x release line)

- **Gateway docs**: `https://github.com/wso2/api-platform/tree/gw-docs-1.1.x/docs/gateway` — covers Kubernetes, observability, resiliency, analytics, policies, immutable gateway, policy languages and runtimes
- **Gateway REST API docs**: `https://github.com/wso2/api-platform/tree/gw-docs-1.1.x/docs/rest-apis/gateway` — covers the management REST API endpoints (operations on a RestApi and any state nested under it, plus controller-wide concerns like auth, secrets, certificates)
- **Individual REST API doc files**: live under `https://github.com/wso2/api-platform/tree/gw-docs-1.1.x/docs/rest-apis/gateway/`. **Don't extrapolate filenames.** List the directory (or fetch its `README.md`) first, then fetch the specific raw URL. Filenames aren't one-per-feature — a single page often covers operations on a parent resource together with management of state nested under it. When a policy doc deflects with *"… is handled outside this runtime policy"* and gives no link, the answer almost always lives somewhere in this tree.
- **CLI docs**: `https://github.com/wso2/api-platform/tree/ap-docs-0.8.x/docs/cli` — `reference.md`, `quick-start-guide.md`, `customizing-gateway-policies.md`

---

## Phase 1 — Setup

Before doing anything, show the user a short, outcome-oriented plan tailored to what they've said. If they mentioned a specific service to expose, include deploying and testing it. If they only want the gateway set up, keep it to setup. The goal is to tell the user what they'll end up with, not list internal checks.

Example when the user wants to expose a service:
```text
I'll set up the WSO2 API Platform Gateway and expose your service.
Here's what I'll do:
✦ Install the ap CLI
✦ Confirm which gateway to use (set one up, or connect to one you have) 
✦ Connect the CLI to the gateway
✦ Deploy your API
✦ Test it end to end
```

Example when the user just wants the gateway running:
```text
I'll get the WSO2 API Platform Gateway running for you.
Here's what I'll do:
✦ Install the ap CLI
✦ Confirm which gateway to use (set one up, or connect to one you have) 
✦ Connect the CLI to the gateway
✦ Verify everything is healthy
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
Run the bundled install script — it detects the platform, downloads the matching ap CLI release into `~/Downloads`, moves the binary to `~/.local/bin/ap`, cleans up, and ensures `~/.local/bin` is on PATH for future shells.

```bash
bash <absolute-path-to-skill>/scripts/install-ap-cli.sh
```

The script prints one summary line on success: `ap installed at /Users/.../.local/bin/ap (path-already-configured | path-added-to:<rc-file> | path-update-failed:<rc-file>)`.

Verify immediately:
```bash
ap --help
```

If `ap --help` succeeds, continue to Step 2. The only install-script status worth surfacing is `path-update-failed:<rc-file>` — it means the user has to act if they want to use `ap` in their own terminals. Tell them: *"Heads up: I couldn't update your shell profile automatically. To use `ap` in your own terminals, add this to `~/.zshrc` or `~/.bashrc`: `export PATH=\"$HOME/.local/bin:$PATH\"`."* Then continue. For `path-already-configured` and `path-added-to:<rc-file>`, say nothing extra — just continue.

If `ap --help` actually fails — rare; only happens when the Bash tool's PATH didn't pick up `~/.local/bin` — fall back: tell the user *"`~/.local/bin` isn't on the Bash tool's PATH yet. Please run `source ~/.zshrc` (or `source ~/.bashrc`), or restart this Claude Code session, then confirm here."* Wait, then re-run `ap --help`.

> **Note for agent:** From this point on, always invoke `ap` by its bare name — never the full path `~/.local/bin/ap`.

**Step 2 — Find or set up the gateway**

First, check what the CLI already knows about — the user may have registered a gateway in a prior session:

```bash
ap gateway list
```

**If the list shows one or more gateways:**

Show the user the list (display-name and server URL is enough), then ask:

> "I see these gateways are already registered with the CLI: <list>. Want to connect to one of these, or set up / connect to a different one?"

**Stop and wait for the user's reply.** Do not run `ap gateway use`, `ap gateway health`, or any other command until they answer. This applies even when only one gateway is registered — don't auto-select; one entry is still a choice.

**If the user picks one:** we already have its URL and auth from the CLI; just verify it's healthy:
```bash
ap gateway use --display-name <picked>
ap gateway health
```
- Healthy → skip Steps 3 and 4 entirely; go straight to Step 5 / Phase 2.
- Unhealthy → diagnose before falling through. Likely causes: compose stack stopped (`docker compose -p gateway ps`), URL changed, server moved. Surface the diagnosis to the user and offer to re-set-it-up or pick a different option — don't silently treat this as "no gateway".

**If the user wants a different one:** fall through to the existing-vs-fresh question below.

**If `ap gateway list` reports no gateways:** fall through to the existing-vs-fresh question below.

---

Ask the user (only when the registered-list branch above didn't resolve):

> "Do you already have an API platform gateway you want to connect to, or should I set up a fresh local gateway?"

Branch on the answer.

**A. Existing gateway**

Ask for, in order:
1. **Management URL** (`--server`, e.g. `https://team-gw.example.com:9090` or `http://localhost:9091`)
2. **Admin URL** (`--admin-server`, e.g. `https://team-gw.example.com:9094`)
3. **Display-name** to register it under. Default `dev` for a local custom-port instance; suggest something contextual like `team` or `prod` if the URL is non-local.
4. **Auth method**: `none` / `basic` / `bearer`. The fresh-local branch (Step 4) is fully automated — the agent runs a script that pre-registers the local gateway with its documented public defaults, no credential handling in chat. For an existing remote gateway, the user runs `ap gateway add` themselves in their own terminal so the CLI prompts them interactively for username/password (or token); the agent must not accept those credentials inline in chat. If the user pastes a password or token, do not echo it back, do not include it in any command, and do not store it.

Verify the admin URL is reachable before adding the gateway:

```bash
curl -s --max-time 5 <admin-url>/api/admin/v0.9/health
```

- **Healthy** → skip Step 3 (no local install needed), go straight to Step 4 (existing-gateway sub-branch) with the user's URLs.
- **Unreachable** → tell the user the admin URL didn't respond and ask them to check the URL / VPN / firewall. Don't proceed to Step 4 until they confirm a working URL.

**B. Fresh local gateway**

Silently probe in case the user already has one running and forgot:

```bash
curl -s --max-time 3 http://localhost:9094/api/admin/v0.9/health
```

- **Healthy** → silently reuse. Tell the user *"I see a gateway already running locally — using that. Ask me if you want a clean rebuild."* Skip Step 3 and go to Step 4's fresh-local sub-branch (the script handles the local gateway with default credentials, regardless of whether the gateway was started this session or a previous one).
- **Not healthy** → continue to Step 3 to extract and start the local gateway.

**Step 3 — Check Docker and set up the gateway (local only)**

Confirm Docker is installed:
```bash
docker --version
```

Then run the bundled setup script. It detects the Compose variant, extracts the gateway release to `~/wso2-api-gateway/v<version>/`, and brings up the Compose stack with project name `gateway`.

```bash
bash <absolute-path-to-skill>/scripts/setup-gateway.sh
```

The script prints one summary line on success: `gateway ready at /Users/.../wso2-api-gateway/v1.1.0 (reused-existing | freshly-extracted); compose project: gateway`. Use the bracketed status to choose what to tell the user:

- `freshly-extracted` — *"Gateway extracted at `~/wso2-api-gateway/v1.1.0/`. The Compose project name is `gateway` — to stop it later: `cd ~/wso2-api-gateway/v1.1.0 && docker compose -p gateway down`."*
- `reused-existing` — *"Found an existing gateway extraction at `~/wso2-api-gateway/v1.1.0/` — reusing it. If you want a fresh copy, ask me and I'll remove that directory and re-run setup."*

If Docker Compose isn't installed, the script exits non-zero with an error message — tell the user: *"Docker Compose is required. Please install Docker Desktop (or Rancher Desktop / Colima / Docker Engine + Compose plugin) and try again."*

Wait a few seconds, then verify: `curl -s http://localhost:9094/api/admin/v0.9/health`

**Step 4 — Connect the ap CLI**

Format:
```bash
ap gateway add --display-name <name> --server <server-url> --admin-server <admin-server-url> [--auth <none|basic|bearer>]
```

`--admin-server` is required — without it, `ap gateway health` in Step 5 fails.

The flow differs by branch. For the local gateway the agent provisions the CLI config from the gateway's documented public defaults (no credential handling in chat); for any gateway with real user credentials, the user runs `ap gateway add` themselves so the CLI prompts them interactively.

**For the fresh-local case** (Step 2 branch B): run the bundled script. It writes `~/.wso2ap/config.yaml` with a `dev` entry pointing at `http://localhost:9090` / `http://localhost:9094`, using the gateway's shipped defaults (`admin` / `admin`, defined in `~/wso2-api-gateway/v<ver>/configs/config.toml` under `[[controller.auth.basic.users]]`). The script is idempotent.

```bash
node <absolute-path-to-skill>/scripts/init-local-cli-config.js
```

The script prints one summary line:
- Stdout containing `cli config initialized at <path-to-config.yaml> (created)` — fresh write; continue.
- Stdout containing `cli config initialized at <path-to-config.yaml> (local-already-registered)` — `dev` entry already present from a prior session; continue.
- Non-zero exit with a message containing `config.yaml already exists with other gateway entries` — the user already has unrelated gateway entries the script won't touch. Surface the script's printed `ap gateway add ...` instruction to the user and have them run it themselves.

After the script succeeds, the agent continues — no user input needed.

**For the existing-gateway case** (Step 2 branch A): the agent does not run `ap gateway add` itself and does not include credentials in any command. Use the URLs, display-name, and auth method the user gave you in Step 2 — don't re-prompt — and hand them the templated command to run in their own terminal:

> "Please run this in your terminal. The CLI will prompt for credentials — enter them there, not here. Tell me when `ap gateway add` succeeds:
> ```bash
> ap gateway add --display-name <user-supplied-name> --server <user-supplied-server-url> --admin-server <user-supplied-admin-url> --auth <none|basic|bearer>
> ```"

Wait for the user to confirm before continuing.

Subsequent `ap` commands (`ap gateway use`, `ap gateway health`, `ap gateway apply`, etc.) read credentials from the CLI's stored config, so the agent can run those.

**Step 5 — Verify gateway health**

```bash
ap gateway health
```

If healthy, report ✓ and move to Phase 2.

---

## Phase 2 — Expose an API

Before starting, show the user a brief plan:
```text
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
```text
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

```text
What would you like to configure?
→ [Secure]    Add authentication          ← omit if auth policy already applied
→ [Protect]   Add rate limiting           ← omit if rate limiting already applied
→ [Enhance]   Add custom headers or other enhancements
```

**Add headers (set-headers policy)** — read `references/api-yaml-examples.md` for the set-headers example. The confirmed policy name is `set-headers` version `v1`.

**Authentication, rate limiting, guardrails, transforms, interception** — fetch the **PolicyHub catalog** and follow the link to the policy you need:

`https://raw.githubusercontent.com/wso2/gateway-controllers/main/docs/README.md`

This is an auto-generated table of every available policy with a one-line description and a **direct, resolved link** to its markdown reference (params, YAML examples, defaults). The catalog is the source of truth — **use its links verbatim**. Don't rewrite raw URLs by hand even when you've seen the filename before; the full path is `…/wso2/gateway-controllers/main/docs/<policy>/<version>/docs/<filename>.md` and the leading `docs/` segment is easy to drop. Filenames are also inconsistent (some drop punctuation, others are truncated relative to the policy name), so reconstructing from a policy name guesses two things wrong at once. Click through from the catalog row instead.

Workflow:
1. Fetch the catalog above. Find the row for what the user wants.
2. Follow the link in that row to the policy's markdown. Use its YAML and `params` to write the policy block in the RestApi spec.

For the meta-question of how policies attach to a RestApi (`build.yaml` shape) or how to author a custom policy in Go or Python, see the 1.1 docs — only fetch these if the user is building their own policy, not when applying an existing one:
- Policy customization model: `https://raw.githubusercontent.com/wso2/api-platform/ap-docs-0.8.x/docs/cli/customizing-gateway-policies.md`
- Runtime support: `https://raw.githubusercontent.com/wso2/api-platform/gw-docs-1.1.x/docs/gateway/policy-languages-and-runtimes.md`

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
Credentials never flow through chat or through commands the agent runs.
- **Local gateway**: agent runs `scripts/init-local-cli-config.js`, which writes `~/.wso2ap/config.yaml` with the gateway's documented defaults (`admin` / `admin`, sourced from `configs/config.toml` in the gateway release). These are public fixture values, not user secrets.
- **Existing/remote gateway**: user runs `ap gateway add --auth basic` (or `--auth bearer`) themselves in their own terminal; the `ap` CLI prompts interactively for username/password (or token) and writes them to its stored config.

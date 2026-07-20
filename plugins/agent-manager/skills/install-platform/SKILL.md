---
name: install-platform
description: Use when a user wants WSO2 Agent Manager (AMP) itself installed — set up / stand up / deploy the Agent Manager platform on this machine, a laptop, or a VM. Installs the latest released version end-to-end and configures amctl. Not for deploying agents onto an existing installation (that is manage-agent).
---

# install-platform

Install a **released** WSO2 Agent Manager on the current machine or a user-provided VM.
This skill is deliberately thin: the authoritative, version-correct procedure ships inside
the product repo at each release tag. Your job is to resolve the version, fetch that
procedure, and follow it.

**Precedence rule: the fetched guide overrides this skill and anything you remember about
installing Agent Manager.** Never install from memory or from a hardcoded version.

## Step 1 — sanity-check the environment

Confirm before starting (a failed install wastes ~20 minutes):

- Docker installed and responding (`docker ps`). On macOS prefer Colima; the fetched guide
  has the exact profile command.
- Roughly 4 CPUs / 8 GB RAM available to Docker.
- For a VM install: Linux, static public IPv4, inbound 443 open, root access.

If something is missing, fix it or report to the user — do not start the installer.

## Step 2 — resolve the latest release

```bash
TAG=$(gh api "repos/wso2/agent-manager/releases?per_page=30" \
  -q '[.[].tag_name | select(startswith("amp/v"))][0]')
```

Without `gh`:

```bash
TAG=$(curl -fsSL "https://api.github.com/repos/wso2/agent-manager/releases?per_page=30" \
  | grep -o '"tag_name": *"amp/v[0-9][0-9.]*"' | head -1 | sed 's/.*"\(amp\/v[0-9.]*\)"/\1/')
```

The repo hosts other release lines (`amp-instrumentation/*`, …) — always filter for the
`amp/v` prefix; never use the `releases/latest` endpoint. If the API is rate-limited, fall
back to `https://github.com/wso2/agent-manager/releases.atom` and take the first `amp/v*`
entry. If no `amp/v*` release exists, stop and report.

## Step 3 — fetch the versioned install guide

```bash
curl -fsSL "https://raw.githubusercontent.com/wso2/agent-manager/${TAG}/deployments/AGENT_INSTALL.md"
```

If this 404s (releases older than the guide), fall back to the same-tag human docs — warn
the user the flow is degraded and adapt the interactive steps yourself:

- `.../${TAG}/documentation/docs/getting-started/quick-start.mdx`
- `.../${TAG}/documentation/docs/getting-started/on-a-vm.mdx`
- `.../${TAG}/documentation/docs/getting-started/cli-installation.mdx`

## Step 4 — follow the guide

Notes that stay true across versions:

- Installation runs 15–25 minutes. Run it in the background or with a long explicit
  timeout, and monitor its log.
- `amctl login` is an interactive browser flow — always have the **user** run it in their
  own terminal, then verify with `amctl project list --json`.

## Step 5 — verify, report, hand off

Run the guide's health checks. Report to the user: console URL, credentials, API URL, and
amctl status. Then point at the `manage-agent` skill for creating projects and deploying
agents.

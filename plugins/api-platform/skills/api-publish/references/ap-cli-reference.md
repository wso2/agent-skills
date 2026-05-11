# ap CLI Reference — WSO2 API Platform

## Official Documentation

Fetch these when you need command syntax, flags, or installation steps — they are the authoritative source:

| Document | Raw URL |
|----------|---------|
| Quick Start Guide | `https://raw.githubusercontent.com/wso2/api-platform/ap-docs-0.8.x/docs/cli/quick-start-guide.md` |
| Full CLI Reference | `https://raw.githubusercontent.com/wso2/api-platform/ap-docs-0.8.x/docs/cli/reference.md` |
| Customizing Gateway Policies | `https://raw.githubusercontent.com/wso2/api-platform/ap-docs-0.8.x/docs/cli/customizing-gateway-policies.md` |

The CLI reference covers all 15 gateway sub-commands (add, list, use, current, health, remove, apply, api, mcp, image build, etc.), short flag aliases, and authentication setup.

---

## Critical Corrections

### REST API subcommand — use `rest-api`, NOT `api`

The official `reference.md` shows `ap gateway api list/get/delete` — **this is outdated and will fail**. Always use `rest-api`:

```bash
# Correct:
ap gateway rest-api list
ap gateway rest-api get --display-name <name> --version <v> --format yaml
ap gateway rest-api get --id <id> --format json
ap gateway rest-api delete --id <id>

# Wrong (will fail):
ap gateway api list
ap gateway api get
ap gateway api delete
```

---

## Supplements (not in official docs)

### Gateway ports (local Docker)

| Port | Purpose |
|------|---------|
| 9090 | Gateway-Controller REST API — `--server` flag; REST API management (`/api/management/v0.9/...`) |
| 9094 | Gateway-Controller Admin — `--admin-server` flag; controller health (`/api/admin/v0.9/health`); backs `ap gateway health` |
| 8080 | Runtime HTTP — app traffic |
| 8443 | Runtime HTTPS |

### CLI config file

The `ap` CLI stores registered gateway connections at `~/.wso2ap/config.yaml`. Shape:

```yaml
gateways:
  - name: <display-name>
    server: <server-url>
    adminServer: <admin-url>
    auth: none|basic|bearer
    username: <user>     # basic only
    password: <pass>     # basic only
    token: <token>       # bearer only
activeGateway: <display-name>
```

`ap gateway add` writes to this file; `ap gateway use`, `ap gateway list`, `ap gateway health`, etc. read from it. The bundled `scripts/init-local-cli-config.js` populates it directly for the local-gateway case using the gateway's documented public defaults.


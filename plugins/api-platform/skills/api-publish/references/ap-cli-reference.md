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

### Operations the CLI does NOT cover — call the REST API directly

Don't run `ap gateway --help` / `ap gateway rest-api --help` looking for these; they aren't there. Call the management REST API on port 9090 (basic auth, default `admin:admin`).

| Operation | Endpoint | SKILL.md section |
|-----------|----------|------------------|
| Generate / list / regenerate / update / delete API keys (for `api-key-auth`) | `POST/GET/PUT/DELETE /api/management/v0.9/rest-apis/{id}/api-keys[...]` | "Post-deployment steps for `api-key-auth`" |
| JWT IDP configuration, other per-policy runtime config | various `/api/management/v0.9/rest-apis/{id}/...` | "Post-deployment steps for other policies" |

Full reference: `https://raw.githubusercontent.com/wso2/api-platform/gw-docs-1.1.x/docs/rest-apis/gateway/rest-api-management.md` (1000+ lines; jump to anchors).

---

## Supplements (not in official docs)

### Gateway ports (local Docker)

| Port | Purpose |
|------|---------|
| 9090 | Gateway-Controller REST API — `--server` flag; REST API management (`/api/management/v0.9/...`) |
| 9094 | Gateway-Controller Admin — `--admin-server` flag; controller health (`/api/admin/v0.9/health`); backs `ap gateway health` |
| 8080 | Runtime HTTP — app traffic |
| 8443 | Runtime HTTPS |


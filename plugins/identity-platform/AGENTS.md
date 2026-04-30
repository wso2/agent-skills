# identity-platform Plugin — Agent Conventions

## asgardeo-auth Skill

End-to-end Asgardeo authentication setup. Four sequential phases:
1. **CLI Setup** — install bundled CLI binary to `/usr/local/bin`, classify auth state (authenticated / session expired / no profile), and run `asgardeo config create` + `asgardeo auth login` only when needed
2. **Config File** — generate or merge `.asgardeo/config-<profile>.yaml` against `schema/config-profile.yaml`, then apply with `asgardeo apply --non-interactive`
3. **Consumer Key Retrieval** — `asgardeo app get --app-id <uuid> --credentials` (table output only — JSON/YAML omit credentials)
4. **SDK Integration** — install the framework SDK and write minimal provider + login/logout

## Shared Conventions

- Never execute immediately — assess silently, present a plan, confirm before touching files or running commands
- Use the declarative config file as the source of truth; do not call `asgardeo app create` for apps tracked by a config file
- Always use `asgardeo apply --non-interactive` — the interactive prompt requires a TTY and panics when piped
- SPAs default to `client_type: public` (PKCE, no `clientSecret`) and a single regex `redirect_uris` entry like `regexp=(http://localhost:5173(/callback)?)` to cover both login and post-logout URIs in one entry (Asgardeo rejects multiple plain entries with API error 501)
- Always include `internal_login` in scopes so `/scim2/Me` returns the full profile, and always set `allowed_origins` so browser SDK calls aren't blocked by CORS
- Detect framework from `package.json` before asking the user
- Never store the M2M client secret in application code or `.env` files committed to git

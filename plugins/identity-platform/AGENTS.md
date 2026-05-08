# identity-platform Plugin — Agent Conventions

## asgardeo-auth Skill

End-to-end Asgardeo authentication setup. Four sequential phases:
1. **CLI Setup** — install bundled CLI binary to `/usr/local/bin`, classify auth state via `whoami --output json` (parse `token_valid`, not exit code), and run `asgardeo config create` + `asgardeo auth login` (or `auth refresh`) only when needed
2. **Config File** — generate or merge `.asgardeo/config-<profile>.yaml` against `schema/config-profile.yaml`, optionally preview with `asgardeo plan`, then apply with `asgardeo apply --non-interactive`
3. **Consumer Key Retrieval** — `asgardeo app get --name "<app>" --credentials --output json` (works in all output formats)
4. **SDK Integration** — install the framework SDK and write minimal provider + login/logout

## Shared Conventions

- Never execute immediately — assess silently, present a plan, confirm before touching files or running commands
- Use the declarative config file as the source of truth; do not call `asgardeo app create` for apps tracked by a config file
- Always use `asgardeo apply --non-interactive` — the interactive prompt requires a TTY and panics when piped. Default `apply` (no filter flags) applies apps + users + groups; `--apps`/`--users`/`--groups` are filters
- Check session validity via `whoami`'s `token_valid` field, not exit code (exit is 0 even when expired); recover with `auth refresh` first, fall back to `auth login`
- SPAs default to `client_type: public` (PKCE, no `clientSecret`) and a single regex `redirect_uris` entry like `regexp=(http://localhost:5173(/callback)?)` to cover both login and post-logout URIs in one entry (Asgardeo rejects multiple plain entries with API error 501)
- For backends doing JWKS verification, set `access_token.type: JWT` in the config (default is opaque)
- Group membership is declarative under `groups[].members` using `DEFAULT/<username>` entries — prefer this over `asgardeo group add-user`
- Always include `internal_login` in scopes so `/scim2/Me` returns the full profile, and always set `allowed_origins` so browser SDK calls aren't blocked by CORS
- Detect framework from `package.json` before asking the user
- Never store the M2M client secret in application code or `.env` files committed to git

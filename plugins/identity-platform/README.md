# identity-platform Plugin

Agent skills for the WSO2 Identity Platform.

## Skills

| Skill | Triggers |
|-------|----------|
| **asgardeo-auth** | Add Asgardeo authentication to a React, Next.js, Vue, or Express app; configure the Asgardeo CLI; register OAuth2 apps via the declarative config file; integrate the Asgardeo SDK (provider + login/logout) |

## Getting Started

See the [installation instructions](../../README.md#installation) in the main README to install this plugin. Once installed, just describe what you want in plain language — the skill will pick up the request. Below are some prompts to try.

### Adding Asgardeo Auth to an App

Go from a fresh project to a working login flow.

```
> Add Asgardeo authentication to my React app.
```
```
> Set up Asgardeo SSO in this Next.js project.
```
```
> Integrate Asgardeo login/logout into the Vue app.
```

The skill will:
1. Verify the Asgardeo CLI is installed and authenticated (using the bundled binary if needed)
2. Detect the framework from `package.json`
3. Ask only for what it can't infer (org name, M2M credentials if no profile exists, application name)
4. Generate or update `.asgardeo/config-<profile>.yaml` and apply it with `asgardeo apply --non-interactive`
5. Retrieve the OAuth2 consumer key for SDK configuration
6. Install the right Asgardeo SDK and write minimal `AsgardeoProvider` + login/logout code

### Configuring an Existing Setup

If you already have a partial setup, the skill merges into the existing config file rather than overwriting.

```
> Register a new OAuth2 application in my Asgardeo org for staging.
```
```
> Add a redirect URI for the production deployment to my Asgardeo app.
```

### What You Get

- A `.asgardeo/config-<profile>.yaml` declarative file you can re-apply with one CLI command
- A `client_type: public` SPA app (PKCE, no client secret to leak), with `allowed_origins` set so CORS doesn't block the SDK
- A single regex `redirect_uris` entry covering both `/callback` (login) and the bare origin (post-logout) — the only pattern Asgardeo accepts for multiple URIs
- Provider config wired with `afterSignInUrl`, `afterSignOutUrl`, `internal_login` scope, and `instanceId={1}` (the SDK silently breaks at the default `0`)

## Supported Frameworks

| Framework | SDK Package |
|---|---|
| React (Vite/CRA) | `@asgardeo/react` |
| Next.js ≥15.3 | `@asgardeo/nextjs` |
| Vue 3 | `@asgardeo/vue` |
| Express.js | `@asgardeo/express` |

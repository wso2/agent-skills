# SDK integration — wiring an app to Asgardeo

The Asgardeo docs' quickstarts are the source of truth for SDK syntax — it drifts between versions,
so the skill doesn't embed it. What the skill adds: the inputs, the routing, and the integration
knowledge the quickstarts don't cover.

## Inputs every integration needs (from the CLI)

- **`clientId`** — in the `asg apps create` output (`Client ID:` line, or the payload with
  `--format json`); re-fetch anytime with `asg apps view --name "<app>" --format json -N`.
- **`baseUrl`** — the `Base URL` line from `asg status`, copied verbatim (it looks like
  `https://<host>/t/<org-name>`). Never assemble it from a remembered host: production, dev and
  self-hosted deployments each have their own, and a base URL already in the project is the answer,
  not a mistake to fix.
- **client secret** (`oidc` apps only) — the user reads it from the app's Console page
  (`…/app/applications/<id>#tab=protocol`, see `cli-overview.md`); it never passes through chat.
- The SDK's redirect/callback URL must be a **registered redirect URI** on the app
  (`asg apps protocol view` to confirm) — a mismatch is the #1 cause of broken login.

## Route by framework

Paths are under `https://wso2.com/identity-platform/docs/` and end in `.md`: that is the page's
markdown twin — the content without site navigation — and it is what to fetch (the HTML page of the
same path, without `.md`, is for browsers). Fetch the row's page — **one fetch, not a crawl** for
the quickstarts; it supplies the SDK-specific part (package, provider setup, sign-in/out, user
object). The full index of markdown pages is `docs/llms-full.txt`.

| Framework | App type | SDK | Fetch |
|-----------|----------|-----|-------|
| React (SPA) | `spa` | `@asgardeo/react` | `quick-starts/react.md` |
| Next.js | `oidc` | `@asgardeo/nextjs` | `quick-starts/nextjs.md` |
| Vue | `spa` | `@asgardeo/vue` | `quick-starts/vue.md` |
| Angular | `spa` | `angular-oauth2-oidc` (generic OIDC, as the quickstart shows) | `quick-starts/angular.md` |
| Nuxt | `spa` | `@asgardeo/nuxt` | `quick-starts/nuxt.md` |
| Vanilla JS / other SPA | `spa` | `@asgardeo/auth-spa` | `quick-starts/javascript.md` |
| Spring Boot | `oidc` | Spring Security OAuth2 client (as the quickstart shows) | `quick-starts/springboot.md` |
| Node / Express | `oidc` | `@asgardeo/passport-asgardeo` | `complete-guides/expressjs/install-passport-asgardeo.md`, then `add-login-and-logout.md`, `securing-routes-within-the-app.md`, `display-logged-in-user-details.md` (same folder) |
| .NET (ASP.NET Core / Blazor) | `oidc` | standard OIDC middleware | `complete-guides/dotnet/configure-authentication-properties.md`, then `add-login-and-logout.md`, `securing-routes-within-the-app.md` (same folder) |
| Android / Flutter | `mobile` | as the tutorial shows | `tutorials/auth-users-into-android-apps.md` / `tutorials/auth-users-into-flutter-apps.md` |

Fetch the row's page and wire its snippet into the **user's existing project** with the inputs
above — skip the quickstart's scaffold-a-new-app steps.

**Framework not listed:** find its page in `docs/llms-full.txt` (one fetch) and take the `.md`
path from there — that index is the only source for deep paths.

**The token exchange is always the SDK's or the OIDC library's.** Where the row names a generic
OIDC library (Angular, Spring Boot, .NET, the mobile tutorials), take whichever the fetched page
uses. Writing the authorization-code or PKCE flow by hand
is never the answer, even when a package seems missing.

## Auth state has three states, not two

Between the redirect back from Asgardeo and the SDK finishing the code exchange, the user is
authenticated but the SDK does not know it yet — `isSignedIn` is honestly `false`. A UI written with
only a signed-in and a signed-out branch shows the sign-in prompt to someone who just signed in,
then flips. It looks like a bug and gets reported as one.

**Never render a signed-out branch while the SDK is still resolving the session.**

- **React and Vue** — use the `<Loading>` control component alongside `<SignedIn>`/`<SignedOut>`, or
  branch on `isLoading` / `isInitialized` from `useAsgardeo()`. The quickstart's basic example shows
  only two states; add the third.
- **Vanilla JS (`auth-spa`)** — the exchange is the `signIn()` call you make on the redirect page;
  keep the signed-out UI hidden until it resolves.
- **Next.js** — the session resolves on the server, so this does not arise the same way. Don't add a
  client loading branch unless you actually observe the flash.

## Calling a protected API

Two things the quickstarts don't cover:

**Request the API's scopes at login.** The provider config takes a `scopes` option — list the API's
scopes alongside `openid` and `profile` (e.g. `read:orders`). Without them the token carries no
scopes and every backend check fails. It's defined in `@asgardeo/javascript`, so the React, Vue and
JS SDKs all accept it.

**Get the access token.** In `@asgardeo/react`, `useAsgardeo()` returns `getAccessToken()`; the Vue
and JS SDKs expose the equivalent on their composable/client. Send it as
`Authorization: Bearer <token>`.

Non-JS stacks (Spring Boot, .NET): both live in the OIDC library's own configuration — a scope list
at client setup, and the token from the request's security context.

If a name doesn't resolve, the installed SDK version differs from the docs — check the package's
type definitions under `node_modules/@asgardeo/<pkg>/dist` (they match what's installed), or
re-fetch the quickstart.

Sending the token is half the job; the API must verify it and check the scope per request —
`authorize-app.md` step 6.

## Reading the user and their roles

- **The `roles` claim is empty unless the app requests it**
  (`asg apps claims --id <appId> --add "http://wso2.org/claims/roles" -N -y`), and a user picks up
  newly assigned roles only at their **next login**.
- **Roles usually arrive via `/oauth2/userinfo`, not inside the access token** — a backend
  inspecting only the token sees nothing. Use scopes for API authorization, roles for UI.
- **The value can be a comma-separated string** (`"Employee,Admin"`), not always an array:
  ```js
  const roles = [profile?.roles].flat().flatMap(r => String(r ?? '').split(','));
  ```
- **Profile field names vary** by SCIM mapping and SDK version — read from the SDK's
  flattened/normalized profile object instead of assuming fixed names.
- **Gating UI in a SPA is cosmetic.** A browser app enforces nothing; the security boundary is the
  API checking the token's `scope`. Hide buttons with role checks, never rely on them.

## When login fails after wiring

- **Redirect-URI mismatch** — the #1 cause. The SDK's redirect must exactly match a URI registered
  on the app. Redirect URIs are a protocol setting, so check and fix them with:
  ```bash
  asg apps protocol view --id <appId> -N                      # see callbackURLs
  asg apps protocol update --id <appId> --edit 'callbackURLs=["http://localhost:3000"]' -N -y
  ```
  The list is replaced, so restate every URI already registered, or the others are lost.
- **Roles claim empty** — see above: claim not requested, or no re-login since assignment.
- **Scopes missing from the access token** — the app isn't authorized for the API/scopes (check
  `asg apps apis list --id <appId>`; grant with `asg apps apis add`), or the SDK config
  didn't request them at login.
- **The access token won't decode** — it's opaque, which is Asgardeo's default. Any code that
  splits it on `.` and base64-decodes the payload silently yields nothing, so scope-based UI gating
  fails closed. Switch the app to JWT:
  `asg apps protocol update --id <appId> --edit "accessToken.type=JWT" -N -y`.

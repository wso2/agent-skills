# Asgardeo React Integration

Package: `@asgardeo/react`
Base URL pattern: `https://api.asgardeo.io/t/<org_name>`

## 1. Install

```bash
npm install @asgardeo/react
```

## 2. Wrap app in AsgardeoProvider

Find the app's entry point (`src/main.tsx` or `src/main.jsx` or `src/index.tsx`).
Wrap the root component with `AsgardeoProvider`:

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { AsgardeoProvider } from "@asgardeo/react";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AsgardeoProvider
      baseUrl="https://api.asgardeo.io/t/<org_name>"
      // Replace with your OAuth2 consumer key — retrieve it after `asgardeo apply --non-interactive`:
      //   asgardeo app list --output json                    # get the app UUID
      //   asgardeo app get --app-id <uuid> --credentials     # parse Client Id from table output
      clientId="<consumer-key-placeholder>"
      afterSignInUrl="http://localhost:5173/callback"
      afterSignOutUrl="http://localhost:5173"
      scopes={["openid", "profile", "email", "internal_login"]}
      instanceId={1}
    >
      <App />
    </AsgardeoProvider>
  </React.StrictMode>
);
```

Notes on props:
- `afterSignInUrl` — the post-login redirect (must match a registered redirect URI). Replaces the older `signInRedirectURL`.
- `afterSignOutUrl` — the post-logout redirect (must also match a registered redirect URI). Replaces the older `signOutRedirectURL`.
- `scopes` is plural (the older `scope` is deprecated). `internal_login` is required so `/scim2/Me` returns the full profile.
- The scope only opens the SCIM2 endpoint — Asgardeo still won't release individual claims (name, email, groups) unless they're declared under `user_attributes:` in the app's `config-<profile>.yaml`. Add the claims the UI reads, then re-run `asgardeo apply`. See the skill's SKILL.md "User attributes in tokens" section.
- `instanceId={1}` — must be non-zero, otherwise the OAuth2 `state` prefix is dropped and the callback is silently ignored.

## 3. Add login/logout to App component

Find the root `App` component (`src/App.tsx` or `src/App.jsx`):

```tsx
// src/App.tsx
import { useAsgardeo, useUser } from "@asgardeo/react";

function App() {
  const { isSignedIn, isLoading, signIn, signOut } = useAsgardeo();
  const { profile, flattenedProfile } = useUser();

  if (isLoading) return <p>Loading...</p>;

  const displayName =
    profile?.name?.givenName ||
    flattenedProfile?.userName ||
    "there";

  return (
    <div>
      {isSignedIn ? (
        <>
          <p>Welcome, {displayName}</p>
          <button onClick={() => signOut()}>Logout</button>
        </>
      ) : (
        <button onClick={() => signIn()}>Login with Asgardeo</button>
      )}
    </div>
  );
}

export default App;
```

## 4. Handle the callback route

If using React Router, add a route for the redirect URI path (e.g., `/callback`).
`@asgardeo/react` handles the OAuth2 state exchange automatically when the provider mounts.

> **Watch out for catch-all routes.** A `<Route path="*" element={<Navigate to="/" />} />`
> placed before (or instead of) the `/callback` route will swallow the redirect from
> Asgardeo and strip the `?code=...&state=...` query string before the SDK can read it,
> so sign-in silently fails. Always declare the explicit `/callback` route (and any
> other routes the app needs) **before** the catch-all entry, or render the same root
> component on every path and let the SDK handle the exchange in place.

**However:** the SDK does **not** navigate away from `/callback` after sign-in completes. If the route renders a static spinner, the user is stuck on `/callback` forever even though `isSignedIn` has flipped to `true`. The callback component must redirect itself once `isSignedIn` is true:

```tsx
// src/Callback.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAsgardeo } from "@asgardeo/react";

export default function Callback() {
  const { isSignedIn, isLoading } = useAsgardeo();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isSignedIn) navigate("/", { replace: true });
  }, [isLoading, isSignedIn, navigate]);

  return <p>Signing you in...</p>;
}
```

If the app has no `/callback` route at all (single-page apps that render the same component on every path), the SDK's automatic handling is enough — but most apps with a router need this redirect.

## 5. Display-name fallback (when `useUser()` returns an empty profile)

> Before treating this as a code issue, **confirm `user_attributes` is set** in the app's `config-<profile>.yaml` and `asgardeo apply` was run. Without that, Asgardeo doesn't release the claims, so none of the fallbacks below will see them.

Two real-world cases leave `useUser().profile` empty even with `internal_login` in scopes and `user_attributes` declared:

1. **SDK bug** — some `@asgardeo/react` versions (e.g. 0.23.3) don't reliably surface OIDC claims into `useUser().profile`, even when the access token (decoded) contains them.
2. **Federated / JIT-provisioned users (Google, GitHub, etc.)** — the SCIM2 user record often has empty `name.givenName` / `familyName` because the name lives in the OIDC claims Asgardeo released into the token, not in the SCIM profile. A direct `/scim2/Me` call returns blanks for these users.

Use **`/oauth2/userinfo`** as the primary fallback (it respects `user_attributes` and works for both local and federated users), and keep SCIM2 as a secondary fallback for the SDK-bug case where userinfo is somehow blocked:

```tsx
import { useEffect, useState } from "react";
import { useAsgardeo, useUser } from "@asgardeo/react";

const BASE_URL = "https://api.asgardeo.io/t/<org_name>";

function UserProfile() {
  const { isSignedIn, getAccessToken } = useAsgardeo();
  const { profile } = useUser();
  const [userinfo, setUserinfo] = useState<any>(null);
  const [scim, setScim] = useState<any>(null);

  useEffect(() => {
    if (!isSignedIn || profile?.name?.givenName) return;
    (async () => {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      // Primary: OIDC userinfo — respects user_attributes, includes federated claims
      const u = await fetch(`${BASE_URL}/oauth2/userinfo`, { headers });
      if (u.ok) setUserinfo(await u.json());

      // Secondary: SCIM2 /Me — for local users when userinfo doesn't help
      const s = await fetch(`${BASE_URL}/scim2/Me`, { headers });
      if (s.ok) setScim(await s.json());
    })();
  }, [isSignedIn, profile]);

  const displayName =
    profile?.name?.givenName ||
    userinfo?.given_name ||
    userinfo?.name ||
    scim?.name?.givenName ||
    scim?.userName ||
    profile?.username ||
    userinfo?.email ||
    "User";

  return <p>Welcome, {displayName}</p>;
}
```

The fallback chain is: `useUser() → /oauth2/userinfo → /scim2/Me → username/email → "User"`. Try `useUser()` first — only call the network endpoints when its `profile` stays empty after the loading state resolves.

## Notes

- `signIn()` must be called via `onClick={() => signIn()}` (arrow function), not `onClick={signIn}`. Passing the click event directly to `signIn` corrupts its OAuth2 params argument.
- The `afterSignInUrl` and `afterSignOutUrl` must each match a registered redirect URI in the app's `redirect_uris`. For SPAs needing both, register a single regex entry like `regexp=(http://localhost:5173(/callback)?)` — Asgardeo rejects multiple plain URIs.
- HTTPS is not required for `localhost` development with Asgardeo cloud.

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

## 5. SCIM2 fallback (only if `useUser()` returns empty profile)

Some `@asgardeo/react` versions (e.g. 0.23.3) don't reliably surface SCIM2 fields into `useUser()` even when `internal_login` is in scopes. If `profile` is empty after sign-in, fetch `/scim2/Me` directly:

```tsx
import { useEffect, useState } from "react";
import { useAsgardeo, useUser } from "@asgardeo/react";

function UserProfile() {
  const { isSignedIn, getAccessToken } = useAsgardeo();
  const { profile } = useUser();
  const [scimProfile, setScimProfile] = useState<any>(null);

  useEffect(() => {
    if (!isSignedIn || profile?.name?.givenName) return;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("https://api.asgardeo.io/t/<org_name>/scim2/Me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setScimProfile(await res.json());
    })();
  }, [isSignedIn, profile]);

  const name =
    profile?.name?.givenName ||
    scimProfile?.name?.givenName ||
    scimProfile?.userName;

  return <p>Welcome, {name}</p>;
}
```

Try `useUser()` first — only fetch SCIM2 manually when its `profile` stays empty after the loading state resolves.

## Notes

- `signIn()` must be called via `onClick={() => signIn()}` (arrow function), not `onClick={signIn}`. Passing the click event directly to `signIn` corrupts its OAuth2 params argument.
- The `afterSignInUrl` and `afterSignOutUrl` must each match a registered redirect URI in the app's `redirect_uris`. For SPAs needing both, register a single regex entry like `regexp=(http://localhost:5173(/callback)?)` — Asgardeo rejects multiple plain URIs.
- HTTPS is not required for `localhost` development with Asgardeo cloud.

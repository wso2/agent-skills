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
      clientId="<app_id>"
      signInRedirectURL="<redirect_uri>"
      signOutRedirectURL="<app_base_url>"
      scope={["openid", "profile", "email"]}
    >
      <App />
    </AsgardeoProvider>
  </React.StrictMode>
);
```

## 3. Add login/logout to App component

Find the root `App` component (`src/App.tsx` or `src/App.jsx`).
Add login/logout using the `useAsgardeo` hook:

```tsx
// src/App.tsx
import { useAsgardeo } from "@asgardeo/react";

function App() {
  const { state, signIn, signOut } = useAsgardeo();
  const { isAuthenticated, isLoading, username } = state;

  if (isLoading) return <p>Loading...</p>;

  return (
    <div>
      {isAuthenticated ? (
        <>
          <p>Welcome, {username}</p>
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
`@asgardeo/react` handles the callback automatically when the provider mounts —
no custom callback component is needed unless you want a custom loading screen.

## Notes

- `signIn()` must be called via `onClick={() => signIn()}` (arrow function), not `onClick={signIn}`.
  Passing the click event directly to `signIn` corrupts its OAuth2 params argument.
- The `signInRedirectURL` must exactly match the redirect URI registered in Asgardeo (including path).
- HTTPS is not required for `localhost` development with Asgardeo cloud.

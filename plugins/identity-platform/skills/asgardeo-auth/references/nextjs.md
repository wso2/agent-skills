# Asgardeo Next.js Integration

Package: `@asgardeo/nextjs`
Requires: Next.js ≥15.3.8
Base URL pattern: `https://api.asgardeo.io/t/<org_name>`

## 1. Install

```bash
npm install @asgardeo/nextjs
```

## 2. Add environment variables

Create or update `.env.local`:

```env
ASGARDEO_BASE_URL=https://api.asgardeo.io/t/<org_name>
ASGARDEO_CLIENT_ID=<app_id>
ASGARDEO_CLIENT_SECRET=<client_secret>
ASGARDEO_REDIRECT_URL=<redirect_uri>
```

Do NOT commit `.env.local` to git.

## 3. Add the auth route handler

Create the catch-all route handler for Asgardeo callbacks:

```ts
// app/api/auth/[...asgardeo]/route.ts
export { GET, POST } from "@asgardeo/nextjs";
```

## 4. Add AsgardeoProvider to your layout

```tsx
// app/layout.tsx
import { AsgardeoProvider } from "@asgardeo/nextjs";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AsgardeoProvider>{children}</AsgardeoProvider>
      </body>
    </html>
  );
}
```

## 5. Add login/logout to a component

```tsx
// app/components/AuthButton.tsx
"use client";
import { useAsgardeo, signIn, signOut } from "@asgardeo/nextjs/client";

export function AuthButton() {
  const { session, status } = useAsgardeo();

  if (status === "loading") return <p>Loading...</p>;

  return session ? (
    <>
      <p>Welcome, {session.user?.name}</p>
      <button onClick={() => signOut()}>Logout</button>
    </>
  ) : (
    <button onClick={() => signIn()}>Login with Asgardeo</button>
  );
}
```

## Notes

- The `ASGARDEO_REDIRECT_URL` must exactly match the redirect URI registered in Asgardeo.
- For Next.js App Router, components that use `useAsgardeo` must be Client Components (`"use client"`).
- `ASGARDEO_CLIENT_SECRET` is server-side only — never expose it to the browser.
- `session.user?.name` (and any other user field beyond the bare subject) only populates when the app's `config-<profile>.yaml` declares those claims under `user_attributes:` and `asgardeo apply` was run. Add at minimum `["emailaddress", "given_name", "family_name"]` for a name/email UI; add `"groups"` if the app gates anything on group membership.

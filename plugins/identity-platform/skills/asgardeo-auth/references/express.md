# Asgardeo Express.js Integration

Package: `@asgardeo/express`
Base URL pattern: `https://api.asgardeo.io/t/<org_name>`

## 1. Install

```bash
npm install @asgardeo/express
```

## 2. Add environment variables

Create or update `.env`:

```env
ASGARDEO_BASE_URL=https://api.asgardeo.io/t/<org_name>
ASGARDEO_CLIENT_ID=<app_id>
ASGARDEO_CLIENT_SECRET=<client_secret>
ASGARDEO_REDIRECT_URL=<redirect_uri>
```

Do NOT commit `.env` to git. Add it to `.gitignore`.

## 3. Set up the middleware

```js
// app.js (or index.js)
const express = require("express");
const { asgardeoExpressAuth } = require("@asgardeo/express");
require("dotenv").config();

const app = express();

// Mount Asgardeo auth middleware
app.use(
  asgardeoExpressAuth({
    baseUrl: process.env.ASGARDEO_BASE_URL,
    clientId: process.env.ASGARDEO_CLIENT_ID,
    clientSecret: process.env.ASGARDEO_CLIENT_SECRET,
    redirectUrl: process.env.ASGARDEO_REDIRECT_URL,
    scope: ["openid", "profile", "email"],
  })
);

// Login route — redirects user to Asgardeo
app.get("/login", (req, res) => {
  req.asgardeo.signIn(res);
});

// Logout route
app.get("/logout", (req, res) => {
  req.asgardeo.signOut(res);
});

// Callback route — Asgardeo redirects here after login
app.get("/callback", async (req, res) => {
  await req.asgardeo.handleCallback(req, res);
  res.redirect("/");
});

// Protected route example
app.get("/profile", (req, res) => {
  if (!req.asgardeo.isAuthenticated()) {
    return res.redirect("/login");
  }
  res.json({ user: req.asgardeo.getUser() });
});

app.get("/", (req, res) => {
  if (req.asgardeo.isAuthenticated()) {
    res.send(`<p>Welcome, ${req.asgardeo.getUser().username}</p><a href="/logout">Logout</a>`);
  } else {
    res.send('<a href="/login">Login with Asgardeo</a>');
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
```

## Notes

- `redirectUrl` must exactly match the redirect URI registered in Asgardeo (including path, e.g., `/callback`).
- `ASGARDEO_CLIENT_SECRET` is server-side only — never expose it to the browser.
- Install `dotenv` if not already present: `npm install dotenv`.
- For session persistence across server restarts, configure a session store (e.g., `connect-redis`).
- `req.asgardeo.getUser()` only contains the bare username/subject unless the app's `config-<profile>.yaml` declares the additional claims under `user_attributes:` (e.g. `["emailaddress", "given_name", "family_name", "groups"]`) and `asgardeo apply` was run. If a downstream service verifies the JWT directly, also set `access_token.type: JWT` so the claims are embedded in the token rather than only retrievable via `/scim2/Me`.

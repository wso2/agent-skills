# Authorizing an app — RBAC over API scopes

Asgardeo authorization is **role-based access control built on API scopes**: scopes are the
permissions the app or API checks; roles are how users get them. The pipeline below is ordered —
each step depends on the previous.

Register API + scopes → authorize the app → choose role audience → create roles and assign →
**switch the app to JWT tokens** → enforce in the backend. That fifth step is easy to miss and
blocks the sixth: tokens are opaque by default and a backend cannot read scopes from them.

App and API IDs come from the `create` calls that made them (or `asg apps view --name "<name>"
--format json -N` / `asg apis filter` for pre-existing ones). To see only the APIs the org registered —
`asg apis list` also returns ~200 of Asgardeo's built-in resources — filter by type:
`asg apis filter -q "type eq BUSINESS" -N --format json`. The scopes on one API:
`asg apis scopes list -i <apiId> -N --format json`; don't search scopes org-wide by name.

---

## 1. Register the API resource and its scopes

**Agree the scopes in a table first.** They are the vocabulary everything downstream is built from,
and a scope named wrong is expensive to change once roles and code reference it:

| Scope | Lets someone |
|---|---|
| `read:orders` | See orders |
| `write:orders` | Create and modify orders, including cancelling |

```bash
asg apis create \
  --name "Orders API" \
  --description "Orders backend" \
  --identifier "https://api.example.com/orders" \
  --require-auth \
  --scopes '[{"name":"read:orders","description":"Read orders","displayName":"Read Orders"},
             {"name":"write:orders","description":"Create/modify orders","displayName":"Write Orders"}]' \
  -N -y
```

- `--identifier` is the API's audience (`aud`) value — a URN or URL tokens are issued for.
- Each scope `name` is a **permission** and must match the scope string the app requests at login.
- `--scopes` takes a JSON array inline or `@scopes.json` from a file.
- **Gating your app's own features (no separate backend)?** Same mechanism: model the features as
  scopes on an API resource that represents the app.

Later additions: `asg apis scopes add -i <apiId> --scopes '[…]'`; inspect with
`asg apis scopes list -i <apiId>`.

## 2. Authorize the app for the API + scopes

```bash
asg apps apis add --id <appId> --api-id <apiId> --scopes read:orders,write:orders -N -y
asg apps apis list --id <appId> -N --format json         # verify
```

`--scopes` is comma-separated (or repeated). `--policy` defaults to `RBAC`; `"No Policy"` skips the
role check for that API. Console equivalent: the app's **API Authorization** tab (`#tab=api-authorization`).

## 3. Choose the role audience

- **Application** — the role belongs to one app and gates the APIs authorized to it:
  `--audience-type Application --audience-id <appId>`.
- **Organization** — org-wide: `--audience-type Organization`, no audience ID.

**Warn before switching an app's audience setting to Organization: it permanently deletes the app's
application roles.** (The audience setting itself lives on the app, in the Console.)

## 4. Create roles and assign users/groups

```bash
asg roles create --name "Orders Admin" \
  --audience-type Application --audience-id <appId> \
  -p read:orders -p write:orders \
  -N -y
```

- `-p`/`--permission-name` is repeatable; the values **are** the scope names from step 1 — which is
  why steps 1–2 come first. The create output includes the new role's `id`.

**Show the roles against the scopes**, in the same shape as the table in step 1, so the user can see
which role grants what without reading the commands back:

| Role | Scopes | Who gets it |
|---|---|---|
| Orders Viewer | `read:orders` | Everyone in support |
| Orders Admin | `read:orders`, `write:orders` | Supervisors |

```bash
asg roles users add -i <roleId> -u <userId>                       # -u repeatable
asg roles users add -i <roleId> --users '[{"value":"<userId>"}]'  # JSON array, or @users.json
```

Check with `asg roles users list -i <roleId>`.

**Prefer groups when more than one person holds the role** — assign the role to a group once, then
manage membership instead of re-assigning roles per person:

```bash
asg groups create --name "Ops Team" -N -y                         # output includes the group id
asg groups members add -i <groupId> -u <userId>                   # -u repeatable
asg roles groups add -i <roleId> -g <groupId>                     # the group now grants the role
```

Check with `asg roles groups list -i <roleId>` / `asg groups members list -i <groupId>`. Users added
to the group later inherit the role.

## 5. Switch the app to JWT access tokens

**Do this before writing any backend validation.** Asgardeo issues **opaque** access tokens by
default (`accessToken.type = "Default"`) unless the app is created with `--access-token-type jwt`. An opaque
token is a random string — a backend cannot decode it or read a `scope` claim from it, so
signature-and-claims validation is impossible until the app is switched to JWT.

```bash
asg apps protocol update --id <appId> --edit "accessToken.type=JWT" -N -y
asg apps protocol view --id <appId> -N                   # verify: "type": "JWT"
```

Set it at creation instead and there is nothing to fix later:

```bash
asg apps create --name "<name>" --type spa --redirect-uri "<url>" --access-token-type jwt -N -y
```

(The token type is a protocol setting, so `apps update --edit` cannot reach it; see "Protocol
settings vs application settings" in `cli-overview.md`.)

The alternative to JWT is token introspection (`/oauth2/introspect`) on every request — a network
round trip per call. JWT is the usual choice for a backend that checks scopes.

## 6. Enforce in the app

The app requests the scopes at login (the SDK's `scopes: ['openid','profile','read:orders']`); the scopes the
user's roles permit arrive in the access token's `scope` claim. Per request, the backend validates
the token and checks that claim. A worked Express example (`npm install jose`):

```js
import { createRemoteJWKSet, jwtVerify } from 'jose';

// The Base URL from `asg status`, verbatim — https://<host>/t/<org>. Read it from the
// environment rather than hardcoding a host: production, dev and self-hosted differ, and
// the wrong one fails every token with nothing useful in the error.
const BASE_URL = process.env.ASGARDEO_BASE_URL;
const JWKS = createRemoteJWKSet(new URL(`${BASE_URL}/oauth2/jwks`));

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${BASE_URL}/oauth2/token`,
    });
    // aud is the client ID, so azp/client_id is the check that matters
    if (payload.azp !== process.env.CLIENT_ID) throw new Error('wrong client');
    req.scopes = String(payload.scope || '').split(' ').filter(Boolean);
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

const requireScope = (scope) => (req, res, next) =>
  req.scopes?.includes(scope) ? next() : res.status(403).json({ error: `requires ${scope}` });

app.delete('/api/orders/:id', requireAuth, requireScope('write:orders'), handler);
```

**A newly assigned role or scope reaches tokens only on the user's next login** — an existing
session won't show it.

### Optional — gate on role names instead

To branch on role *names*, request the `roles` attribute on the app:

```bash
asg apps claims --id <appId> --add "http://wso2.org/claims/roles" -N -y
asg apps claims --id <appId> -N --format json  # view current claim configuration
```

(`--add`/`--remove` preserve the other requested claims. Console: the app's **User
Attributes** tab → Roles.) Then read it in the SDK — see "Reading the user and their roles" in
`sdk-integration.md`. Two gotchas:

- **Roles usually arrive via `/oauth2/userinfo`, not the access token** — a backend inspecting only
  the token sees nothing. Prefer scope checks for API authorization; use role names for app-side UI
  gating.
- **The `roles` value can be a comma-separated string** (`"Employee,Admin"`), not always an array —
  parse both.

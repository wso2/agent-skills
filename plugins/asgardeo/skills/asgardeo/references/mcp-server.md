# Securing an MCP server (Track F)

An MCP server is a **resource server**. It never logs anyone in: an MCP client obtains a token
from Asgardeo and sends it as `Authorization: Bearer …`; the server validates it and gates each
tool on the token's scopes. Three things exist in Asgardeo when this is done — the **MCP server**
(an API resource of type `MCP`, whose scopes are the tool permissions), an **MCP client
application** the tokens are issued to, and **roles** that give users those scopes. The last two
are Track A and Track B shapes; only the resource type and the server-side SDK are new.

Docs (fetch the `.md` markdown twins, not the HTML pages):
`https://wso2.com/identity-platform/docs/guides/agentic-ai/mcp/mcp-server-authorization.md` (concepts),
`quick-starts/mcp-auth-server.md` (TypeScript), `quick-starts/mcp-auth-server-py.md` (Python).

## 1. Register the MCP server (API resource, type `MCP`)

Identifier = the MCP server's URL (recommended by the docs; it is what goes in the token's
`aud`). One scope per tool or group of tools:

```bash
asg apis create --type mcp \
  --name "Orders MCP Server" \
  --description "Order tools for agents" \
  --identifier "http://localhost:3000/mcp" \
  --require-auth \
  --scopes '[
    { "name": "orders:read",  "displayName": "Read orders",  "description": "List and view orders" },
    { "name": "orders:write", "displayName": "Write orders", "description": "Create and edit orders" }
  ]' -N -y
```

Capture the returned `id`. It appears in the Console under **Resources → MCP Servers**
(`https://console.asgardeo.io/t/<org>/app/mcp-servers`). List existing ones with
`asg apis filter --query "type eq MCP" -N`.

## 2. Register the MCP client application

`--type mcp` uses the Console's **MCP Client Application** template: authorization-code grant,
public client, PKCE mandatory, **JWT** access tokens, refresh token on.

```bash
asg apps create --type mcp --name "<name>" --redirect-uri "<client callback>" -N -y
```

**JWT is not optional here**, and it is why the type exists. The server-side SDKs validate the
token against Asgardeo's JWKS; an opaque token fails with `invalid_token` on every request and
looks like a broken login. `--type mcp` sets it; do not override it with
`--access-token-type opaque`.

The redirect URI is the **MCP client's** callback, not the server's:

| MCP client | Redirect URI |
|---|---|
| MCP Inspector, *Quick OAuth2 Flow* | `http://localhost:6274/oauth/callback/debug` |
| MCP Inspector, guided flow | `http://localhost:6274/oauth/callback` |
| Claude Desktop, Cursor, VS Code, other hosts | the callback that host documents; register each host's URI, or one app per host |

Ask which client will connect; for a server that has no client yet, register with the Inspector
URI so step 5 can run. When the MCP client is a **server-side process** that can hold a secret,
use `--type oidc --access-token-type jwt` instead (confidential client). When the MCP host is an
**AI agent** that should carry its own identity, the client application is the agent's — Track E,
`agent-identity.md`, and this file's steps 1 and 3–5 still apply to the server.

## 3. Authorize the client for the MCP server, and give users roles

Track B, steps 2–4, unchanged: `asg apps apis add` for the MCP server resource and its scopes;
roles whose permissions are those scope names; assign roles to users. The authorization endpoint
is the same for `MCP` and `BUSINESS` resources. Skipping the role step is the usual cause of
"connected, but every tool call is forbidden".

## 4. Protect the server

### TypeScript / Express — `@asgardeo/mcp-express`

```bash
npm install @asgardeo/mcp-express
```

`.env` (the SDK reads these names):

```env
BASE_URL=<the Base URL line from `asg status`, verbatim>
MCP_RESOURCE=http://localhost:3000/mcp     # must equal the identifier from step 1
PORT=3000
```

```ts
import { configuredAuthServer as auth } from '@asgardeo/mcp-express';

app.use(express.json());
app.use(auth.router());                       // /.well-known/oauth-protected-resource
                                              // /.well-known/oauth-authorization-server
app.post('/mcp', auth.protect(), handler);    // 401 + WWW-Authenticate: Bearer resource_metadata=… without a token
```

What `protect()` does, from the package source (v0.3.0): verifies the JWT's signature against
`${BASE_URL}/oauth2/jwks` and its issuer `${BASE_URL}/oauth2/token`, 60 s clock tolerance. What it
does **not** do:

- **Audience.** `configuredAuthServer` sets no audience, so a valid Asgardeo token for *any* app
  in the org passes. For production build the instance yourself and pin it:
  `new McpAuthServer({ baseUrl, issuer: \`${baseUrl}/oauth2/token\`, resource, audience: '<value>' })`.
  The `aud` an Asgardeo token carries is the client ID by default; decode a real token before
  choosing the value rather than assuming the MCP server identifier is there.
- **Scopes.** Nothing checks the `scope` claim. Read the bearer from `req.headers.authorization`
  when the session initialises (the quickstart does this), decode it (it is already verified),
  and check `scope` includes the tool's scope inside each tool — or return an MCP error.

### Python / FastMCP

No published Asgardeo package; the quickstart supplies a `TokenVerifier` built on PyJWT + JWKS:

```bash
pip install mcp PyJWT httpx pydantic python-dotenv
```

```python
mcp = FastMCP(
    "Orders",
    token_verifier=JWTTokenVerifier(JWKS_URL, AUTH_ISSUER, CLIENT_ID),  # from the quickstart
    auth=AuthSettings(
        issuer_url=AnyHttpUrl(AUTH_ISSUER),                  # <baseUrl>/oauth2/token
        resource_server_url=AnyHttpUrl("http://localhost:8000"),
    ),
)
```

`AUTH_ISSUER=<baseUrl>/oauth2/token`, `JWKS_URL=<baseUrl>/oauth2/jwks`, `CLIENT_ID` = the app from
step 2 (the quickstart validates `aud` against it). The verifier returns the token's `scope` list as
`AccessToken.scopes`; per-tool scope checks are the server's job, same as above. Fetch the quickstart
for `jwt_validator.py` rather than retyping it.

### Other languages

Any JWT library: verify signature via `<baseUrl>/oauth2/jwks`, `iss` = `<baseUrl>/oauth2/token`,
`exp`, and pin `aud`. Serve `/.well-known/oauth-protected-resource` as RFC 9728 (`resource`,
`authorization_servers: ["<baseUrl>/oauth2/token"]`, `scopes_supported`) and answer 401 with
`WWW-Authenticate: Bearer resource_metadata="<that URL>"` — that header is how MCP clients discover
where to log in.

## 5. Prove it — the user's to run

```bash
npx @modelcontextprotocol/inspector --url http://localhost:3000/mcp --transport streamable-http
```

Expected: **Connect** without auth fails with 401; under *Authentication → OAuth 2.0 Flow* enter
the client ID, run the flow, sign in as a test user who holds the role, connect, and the tools
list. A second user without the role should still connect (their token is valid) but be refused by
the scope check inside the tool — if they are *not* refused, step 4's scope check is missing.

## When it fails

| Symptom | Cause |
|---|---|
| `invalid_token` on every call, even right after login | Opaque access token — the app needs `accessToken.type=JWT` (step 2) |
| Inspector never reaches the login page | `/.well-known/oauth-protected-resource` not served (router not mounted) or CORS blocks the browser |
| Login completes, then `redirect_uri` mismatch | Registered URI ≠ the client's callback (table in step 2); Inspector's two flows use different paths |
| Connected, tools listed, calls forbidden | User has no role carrying the scope; or role assigned after login — log in again |
| Token valid but `scope` is empty | Client did not request the scopes, or the app is not authorized for the MCP server (step 3) |

# Agent identity — authenticating AI agents

An **agent** in Asgardeo is an identity for an AI agent — an assistant, a copilot, an autonomous
worker. It gets its own ID and secret, its own roles, and its own access tokens, so every action it
takes is attributable to it and its permissions can be changed without touching anyone else's.

## Start here: how does the agent act?

Before creating anything, settle **whose authority the agent's token carries**. There are two
scenarios, and the choice changes what you wire up:

| | The agent acts… | Use when | Token says |
|---|---|---|---|
| **1** | **on its own** | the agent does its own work with its own permissions — monitoring, enrichment, a task nobody delegated | `sub` = the agent, `aut` = `AGENT` |
| **2** | **on behalf of a user** | the agent does something *for a specific person* — reads their data, acts in their name | `sub` = the user, `act.sub` = the agent |

**Look at the code before asking.** If the API the agent will call already reads an `act` claim,
an `actor`, or `requested_actor` — search the backend for those — someone designed it for
delegation. Say so, and lead with scenario 2.

Ask the scenario, the agent's name, and the role's name and scopes (read the API to know them) in
**one question**, per Gate 2 in `SKILL.md`. The name shows in the Console and audit trails for the
agent's lifetime: propose one from the project, never a placeholder like `test-agent`, and give
each agent its own identity rather than sharing one. If the user is unsure of the scenario, ask:
**should this agent be able to touch any user's data, or only the data of the person who asked it
to act?** The first is 1, the second is 2.

Most assistant-style agents are 2 — "show me *my* orders", "cancel *my* booking". Reach for 1 when
the agent's work isn't tied to a particular person. An agent that wants standing access to a user's
data with no approval at any point has no flow — say so; the choice is 1 with its own permissions or
2 with the user's consent.

The plan then follows `planning.md`: the agent and its sign-in app, the role on that app, the env
file the CLI writes, and how the user will see the agent as the caller.

**Steps 1–2 are the same either way.** After that, follow the matching section.

---

## Step 1 — Create the agent, with its application

Keep two things apart. The **application the agent signs in through** is an OAuth client: it has the
`client_id`, grants and redirect URI, and tokens are issued to it. The **API or MCP server the agent
calls** is an API resource with scopes, never an OAuth application (step 2).

Creating an agent on its own gives you only the identity, not the client. With
`--allow-user-login`, Asgardeo creates the client with the agent: one agent, one client, same ID.
**Do it this way by default, without asking.** The one exception: the agent's code lives inside a
service that already has an Asgardeo application. Then say so in a line and offer the choice,
defaulting to a separate client; if they choose the existing one, use *An application already
exists* below.

### Create the agent with its own application (default)

`--allow-user-login` gives the agent an application that shares its ID, has API-based
authentication on, and is shaped as a public client with PKCE, the authorization-code grant, the
redirect URI you give, and JWT access tokens. `--env-file` makes the CLI write the credentials
straight into the agent's env file, so the secret is never shown.

#### Where the secret lives is the user's decision

The agent's code reads `AGENT_ID`, `AGENT_SECRET` and `CLIENT_ID` from the environment, whatever
put them there; use those names always. How the values get there is a deployment choice the user
owns, so ask, proposing from what the project shows (a `dotenv` dependency or existing `.env`, or a
platform or container config). Then take the matching path:

- **A file the CLI can write — the default whenever the destination is a file.** Use `--env-file`:
  the secret goes Asgardeo → CLI → disk and is never displayed. This is the local-development
  answer, and the walkthrough below.
- **Somewhere the CLI cannot reach** — a secret manager, a platform's variables UI, CI settings.
  Use `-c`, which puts the secret on the user's clipboard for them to paste in. Tell them what to
  paste it into and under which name; **never read the clipboard back** (`pbpaste`, `xclip`, …) —
  reading it would put the secret in your context.
- **Neither fits** — the user runs `asg agents create` themselves and handles the secret without
  you.

Whichever they choose, the secret never passes through the conversation. A dotenv file is a
local-development answer; it should not ship to production or into an image.

#### Writing it to a file (local development)

Do these in order: once step 3 runs, the secret is already on disk.

1. **Pick the env file the agent's code reads** (`.env` next to it) and confirm git ignores it:
   `git check-ignore -q <path>/.env || echo "NOT ignored"`. If it isn't ignored — including
   when it is already tracked, which `.gitignore` alone does not undo — fix that first. Never use
   `.env.example`; that file is meant to be committed.
2. **Write the file with what you already know.** The CLI fills in the rest:
   ```
   ASGARDEO_BASE_URL=<the Base URL line from `asg status`, verbatim>
   REDIRECT_URI=http://localhost:3001/callback
   ```
3. **Create the agent, pointing the CLI at that file:**
   ```bash
   asg agents create --name "orders-assistant" --description "Answers customer questions about orders" \
     --allow-user-login --redirect-uri "http://localhost:3001/callback" \
     --env-file assistant/.env -N -y
   ```

- **`--redirect-uri`** is where a user's browser returns after signing in (section 2). It is
  required either way — the agent's own login checks it too. Confirm it with the user as you would
  for an app.
- **`--env-file`** writes `AGENT_ID`, `AGENT_SECRET` and `CLIENT_ID` into the file: existing lines
  for those keys are replaced, every other line is kept, and a new file is created private.
- For an agent that asks users for approval out of band rather than through a browser, add
  `--agent-type background` (see *Using CIBA* below).

Read the file back only to confirm the keys are present (`grep -c '^AGENT_SECRET=' assistant/.env`),
never to print it. **The secret can never be read again** after this. If it is lost, regenerate it
in the Console (the agent → **Credentials** → **Regenerate**) and update every place the old one
was used.

### An application already exists

Only when the user chose to reuse one. Create a plain agent (same env-file handling as above; without
`--allow-user-login` the CLI writes only `AGENT_ID` and `AGENT_SECRET`, so add the existing app's
`CLIENT_ID` from `apps protocol view` yourself), and make sure the application allows sign-in over the API — the agent flows need it, and it is off by
default on ordinary apps:

```bash
asg agents create --name "orders-assistant" --description "…" --env-file assistant/.env -N -y
asg apps update --id <appId> --edit "advancedConfigurations.enableAPIBasedAuthentication=true" -N
asg apps protocol view --id <appId> --protocol oidc -N   # clientId, grantTypes, callbackURLs, accessToken.type
```

Check the protocol output: the grants must include `authorization_code`, `callbackURLs` must
contain the agent's redirect URI, and `accessToken.type` should be `JWT` (an API cannot read scopes
out of an opaque token). Fix any of them with `asg apps protocol update --id <appId> --edit …`.
Without API-based authentication the agent's first login fails with
`ABA-60007 App native authentication is not enabled`.

## Step 2 — Give the agent its permissions

Run the pipeline in `authorize-app.md` with the role name and scopes the user agreed to. The one
agent-specific part: the auto-created application's role audience is **Application**, so the role is
created against it (an Organization-audience role is not picked up), and the agent joins it as a
role member alongside users:

```bash
asg apps apis add --id <agentId> --api-id <apiId> --scopes read:orders,write:orders -N -y
asg roles create --name "Orders Assistant Access" --audience-type Application --audience-id <agentId> \
  -p read:orders -p write:orders -N -y
asg roles users add -i <roleId> -u <agentId> -N -y
asg agents view --id <agentId> -N --format json   # "roles" lists "Orders Assistant Access"
```

With an existing application, use its ID in place of `<agentId>` for the first two commands. Check
the role landed before moving on: a missing assignment surfaces later as a scope quietly absent from
the token. Give the agent only the scopes it needs — an agent acting on its own has no human in the
loop to catch a mistake.

---

## The SDK, by language

The identity calls are the same whichever agent framework is in use — Vercel AI, LangChain, Google
ADK, CrewAI. What differs by framework is only how the token is handed to the tools or MCP client,
and each framework's quickstart shows that part.

| Language | Install | Client | Own token | On-behalf-of | Framework quickstarts (tool wiring) |
|---|---|---|---|---|---|
| TypeScript / Node | `npm install @asgardeo/javascript` | `new AsgardeoJavaScriptClient({ baseUrl, clientId, afterSignInUrl, scopes })` | `getAgentToken(agentConfig)` | `getOBOSignInURL(agentConfig)` → `getOBOToken(agentConfig, { code, state, session_state })` | `quick-starts/agent-auth-ts.md` (identity only), `vercel-ai-ts.md`, `langchain-ts.md`, `google-adk-ts.md` |
| Python | `pip install asgardeo asgardeo_ai` | `AgentAuthManager(AsgardeoConfig(base_url, client_id, redirect_uri), AgentConfig(agent_id, agent_secret))` | `await m.get_agent_token([scopes])` | `m.get_authorization_url_with_pkce([scopes])` → `await m.get_obo_token(code, agent_token=…, code_verifier=…)` | `quick-starts/agent-auth-py.md` (identity only), `langchain-py.md`, `google-adk-py.md`, `crew-ai-py.md`, `vercel-ai-py.md` |

Quickstart paths are under `https://wso2.com/identity-platform/docs/` and the `.md` is the page's
markdown twin — fetch that, not the HTML page. Fetch the one for the user's
framework and language when wiring the token into tools; use this file for the identity part.

The examples below are TypeScript. The Python calls map one-to-one.

---

# 1. AI agent acting on its own

The agent authenticates with its own ID and secret and receives a token that identifies it. The SDK
does the whole exchange in one call — use it rather than hand-rolling the OAuth flow.

Install with `npm install @asgardeo/javascript dotenv` and let npm pick the version: the package is
pre-1.0 (0.23.x at the time of writing), so a hand-written range like `^1.0.0` doesn't resolve.
If a method here looks off, the truth is in `node_modules/@asgardeo/javascript/dist/*.d.ts`.

```js
// auth.js — get an access token for this agent
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { AsgardeoJavaScriptClient } from '@asgardeo/javascript';

// Load assistant/.env by its own location, so this works from any working directory.
dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) });

const asgardeo = new AsgardeoJavaScriptClient({
  baseUrl: process.env.ASGARDEO_BASE_URL,        // from `asg status`, not a remembered host
  clientId: process.env.CLIENT_ID,               // the application's client_id (step 1)
  afterSignInUrl: process.env.REDIRECT_URI,      // must match the app's redirect URI
  scopes: ['openid', 'read:orders'],             // what to ask for
});

const agentConfig = {
  agentID: process.env.AGENT_ID,
  agentSecret: process.env.AGENT_SECRET,
};

export async function getAgentToken() {
  const token = await asgardeo.getAgentToken(agentConfig);
  return token.accessToken;   // also: refreshToken, expiresIn, scope
}
```

`import 'dotenv/config'` would read `.env` from the *working directory*, so it silently finds nothing
when the agent is started from the repo root — and an empty secret surfaces as
"Agent authentication failed." Loading by module path avoids that.

Then send it like any bearer token: `headers: { Authorization: \`Bearer ${await getAgentToken()}\` }` —
to an MCP client's transport, to `fetch`, to whatever the framework's tool layer takes.

The SDK runs the app-native flow, which is why the application needs API-based authentication and
the authorization-code grant. Tokens last about an hour; a long-running agent should use the refresh
token rather than log in again on every call.

Verify by decoding the token. Expect:

```json
{ "sub": "<agentId>", "aut": "AGENT", "scope": "openid read:orders", "aud": "<clientId>" }
```

`aut: AGENT` is how an API can tell an agent's own token from a user's. If a scope is missing, look at
step 2 — the app's API authorization, the role's audience, the role assignment — not at the API's
validation: a scope the agent isn't entitled to is dropped silently rather than refused.

**Close by telling the user to test it** — run the assistant once against their API — the way
the login track ends with "try signing in". Don't call their API yourself.

**`Agent authentication failed.` with nothing else.** The SDK discards the reason. In practice it is
nearly always the secret — mistyped, stale clipboard, or the placeholder still in `.env`. Check the
`.env` line first; the *Agent authentication* guide below covers replaying the flow by hand.

---

# 2. AI agent acting on behalf of a user

The agent borrows a specific person's permissions, with their consent. The token names both: `sub` is
the user, `act` is the agent.

```json
{ "sub": "<the user's ID>",
  "act": { "sub": "<agentId>" },
  "scope": "openid read:orders" }
```

An API authorizes against `sub` as it would for any user, and can log `act.sub` to record which agent
acted. A compromised agent cannot silently become the user.

The agent needs **its own token first** (section 1) — that is what proves which agent is asking. The
SDK fetches it for you inside `getOBOToken`.

**The scopes in the delegated token are the user's, not the agent's.** They come from the roles
*the user* holds on the agent's application, so the person delegating needs a role there too:
create it against the agent's app (Application audience, as in step 2) with the scopes they may
delegate, and add the user with `asg roles users add -i <roleId> -u <userId> -N -y`. An agent whose
role carries `write:orders` can still not cancel on behalf of a rep who has only `read:orders` —
which is the point.

## The user is signing in

**The user's sign-in is unchanged and happens in the browser.** The agent never sees, asks for, or
handles the user's password. It contributes two things, and the SDK adds both:

1. **`requested_actor=<agentId>`** on the authorization URL — `getOBOSignInURL(agentConfig)` builds
   a normal PKCE authorization URL with it added.
2. **`actor_token=<the agent's own token>`** at the code exchange — `getOBOToken(agentConfig, { code, state, session_state })`
   fetches the agent token and sends it with the code.

Between the two, the agent has to catch the redirect. A tiny HTTP server on the redirect URI does it:

```js
import express from 'express';
import open from 'open';
import { AsgardeoJavaScriptClient } from '@asgardeo/javascript';

const asgardeo = new AsgardeoJavaScriptClient({ baseUrl, clientId, afterSignInUrl: 'http://localhost:3001/callback', scopes: ['openid', 'read:orders'] });
const agentConfig = { agentID: process.env.AGENT_ID, agentSecret: process.env.AGENT_SECRET };

// 1. Send the user to sign in, with requested_actor set to this agent.
await open(await asgardeo.getOBOSignInURL(agentConfig));

// 2. Catch the redirect. The path and port come from the redirect URI registered in step 1.
const authCode = await new Promise((resolve) => {
  const app = express();
  const server = app.listen(3001);
  app.get('/callback', (req, res) => {
    const { code, state, session_state } = req.query;
    res.send('<h1>Signed in — you can close this window.</h1>');
    server.close();
    resolve({ code, state, session_state });
  });
});

// 3. Exchange the code plus the agent's own token for the delegated token.
const oboToken = await asgardeo.getOBOToken(agentConfig, authCode);
// oboToken.accessToken: sub = the user, act.sub = the agent
```

In a web app that already has Asgardeo login, the same two additions go through the framework SDK:
`requested_actor` in the sign-in call's additional params, and the exchange done server-side with the
agent's token. Only use a direct username/password submission for a scripted test with a throwaway
account — never for a real user.

Watch for `invalid_grant — Actor token is not provided in the request.` at the exchange: it means
`actor_token` was omitted, and it appears *after* a successful sign-in, so it reads like the login
failed when it did not.

**Close by telling the user to test it:** start the agent, sign in when the browser opens, use it
once.

## Using CIBA when the user isn't there

When the agent needs a person's approval but they are not at a screen, CIBA asks them out of band:
the agent requests, Asgardeo notifies the user, the agent waits until they approve. A *background*
agent is one set up this way.

If the agent was created with `--agent-type background`, its application already has the CIBA grant,
an approval expiry (`--ciba-expiry`, default 120 s) and notification channels
(`--notification-channels`, default `EMAIL`). Otherwise add them — **all three edits in one
command**, since the grant is rejected until the expiry time is set — keeping `authorization_code`,
which the agent's own token still needs:

```bash
asg apps protocol update --id <appId> --protocol oidc \
  --edit 'grantTypes=["authorization_code","refresh_token","urn:openid:params:grant-type:ciba"]' \
  --edit 'cibaAuthenticationRequest.authReqExpiryTime=120' \
  --edit 'cibaAuthenticationRequest.notificationChannels=["EMAIL"]' -N -y
```

`notificationChannels` accepts `EMAIL`, `SMS`, or `EXTERNAL` (the application delivers the
notification itself). For `EMAIL`, the user needs a registered email address.

The SDK has no CIBA helper yet, so this part is two plain requests from the agent's code:

```js
// 1. Ask. login_hint names the user; actor_token is the agent's own token.
const askRes = await fetch(`${BASE}/oauth2/ciba`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'openid read:orders', login_hint: userEmail,
    binding_message: 'Cancel order #482 for Acme Corp',
    actor_token: await getAgentToken(),
  }),
});
const { auth_req_id, interval, expires_in } = await askRes.json();

// 2. Poll until the user answers or the request expires.
const deadline = Date.now() + expires_in * 1000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, interval * 1000));
  const pollRes = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:openid:params:grant-type:ciba', client_id: CLIENT_ID, auth_req_id,
    }),
  });
  const body = await pollRes.json();
  if (pollRes.ok) return body.access_token;           // approved
  if (body.error !== 'authorization_pending') throw new Error(body.error_description);
}
throw new Error('the user did not respond in time');
```

(A confidential client sends `Authorization: Basic base64(client_id:client_secret)` on both calls
instead of `client_id` in the body.)

`binding_message` is what the user sees in the notification, and all they have to judge by — say what
the agent wants to do, specifically. An agent that asks vaguely trains people to approve without
reading. Respect `interval` rather than polling faster, and stop at `expires_in`.

---

## Sources

When the org returns something this file doesn't cover, or a real token differs from what is shown
here, believe the org and go to the source, in this order:

- **The agent flows and their prerequisites** — the *Agent authentication* guide:
  `https://wso2.com/identity-platform/docs/guides/agentic-ai/ai-agents/agent-authentication.md`
- **Creating and managing agents, credentials, roles** — the sibling guides under
  `guides/agentic-ai/ai-agents/` (*Register and manage agents*, *Agent credentials*, *Access control for agents*)
- **A framework's tool wiring** — its quickstart from the table above
- **CIBA for agents end to end** — `tutorials/ciba-for-ai-agents.md`
- **Where the SDK's behaviour is the question** — its source: `asgardeo/javascript` on GitHub,
  `packages/javascript/src/AsgardeoJavaScriptClient.ts`

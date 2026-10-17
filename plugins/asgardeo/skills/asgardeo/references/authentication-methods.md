# Authentication methods — configuring how users log in

"How users authenticate" = the application's **login flow** (its authentication sequence). Asgardeo
supports many methods (password, social, enterprise/federated, MFA, passwordless), and the official
guides are the source of truth: https://wso2.com/identity-platform/docs/guides/authentication/
(fetch a page's `.md` twin, e.g. `guides/authentication/social-login/add-google-login.md`; the index is `docs/llms-full.txt`)

There are two layers, and they sit on different sides of the CLI boundary:

1. **Connections / identity providers** (Google, GitHub, an enterprise OIDC/SAML IdP, etc.) — the
   reusable building blocks an org offers.
2. **The per-app login flow** — which of those (plus built-in factors like password, TOTP, Email OTP)
   the app uses, and in what sequence/conditions.

## What the CLI can and can't do

| Task | CLI? | How |
|------|------|-----|
| Edit an app's login flow / authentication sequence | **Yes** | `asg apps update --edit "authenticationSequence=@seq.json"` — the recipe below |
| Add a built-in factor to a flow (password, TOTP, Email OTP, SMS OTP) | **Yes** | edit the app's authentication sequence (no connection needed for system authenticators) |
| List existing connections to reference in a flow | **Yes** | `asg idps list` / `asg idps view` to get the IdP name/ID |
| **Create** a new connection / IdP (social, enterprise, passkey provider, etc.) | **No — Console** | `asg idps` is read-only (list/view/delete). Create it in the Console, then reference it |
| Conditional/adaptive auth scripts, JIT provisioning toggles | **Mostly Console** | some live in the app config (editable via `--file`); the script editor is a Console experience |

> Be honest about the split: tell the user which parts you did with the CLI and which they need to do in
> the Console (`asg apps settings --name <app>` opens it).

## Editing an app's login flow with the CLI

Don't guess the JSON schema — **read the real sequence, edit it, patch it back:**

```bash
# 1. Read the current authenticationSequence from the app object
asg apps view --name "<app>" --format json -N > app.json     # stdout is pure JSON

# 2. Write the modified sequence to its own file, e.g. seq.json —
#    take .authenticationSequence from app.json, add/change steps/options
#    (set "type": "USER_DEFINED" when you change the flow)

# 3. Patch just that attribute back onto the app
asg apps update --name "<app>" --edit "authenticationSequence=@seq.json" -N -y

# 4. Verify
asg apps view --name "<app>" --format json -N   # check the steps took
```

Then the user signs in with a test user (Track A) to confirm the new method appears and works. A
flow change applies from the next login, so an existing session will not show it.

Example `seq.json` adding TOTP as a second factor:

```json
{
  "type": "USER_DEFINED",
  "steps": [
    {"id": 1, "options": [{"idp": "LOCAL", "authenticator": "BasicAuthenticator"}]},
    {"id": 2, "options": [{"idp": "LOCAL", "authenticator": "totp"}]}
  ],
  "subjectStepId": 1,
  "attributeStepId": 1
}
```

Notes:
- **Use the authenticator names the app object returns**, not the ones the create API accepts —
  password is `BasicAuthenticator` in a stored sequence, though `basic` is accepted at creation
  time. Copying step 1's export is the reliable way to get them right.
- `--edit` also handles a single scalar field without a file: `--edit description="New description" -N -y`.
- **`--edit` only reaches the application object.** Protocol settings — callback URLs, grant types,
  access token type — live in a separate resource with its own command, `asg apps protocol update`
  (see `cli-overview.md`). `apps update --edit protocol.…` returns a generic 400.
- **`apps update --file` is a different beast for applications** — it round-trips the server's
  *export* format (a legacy service-provider schema where the flow lives under
  `localAndOutBoundAuthenticationConfig`), not the `apps view` JSON. Use it for whole-app
  backup/restore, not for flow editing; the `--edit … =@seq.json` patch above is the flow-editing
  path.

To add a **federated/social** step, the connection must already exist (create it in the Console), then
reference it by name/ID — get that from `asg idps list` — inside the exported sequence. To add a
**built-in MFA factor** (e.g. TOTP as a second step), add it to the sequence directly; no connection
needed.

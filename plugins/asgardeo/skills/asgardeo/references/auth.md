# Authenticating the `asg` CLI

Two rules govern everything here. **A credential is never yours** — no client secret in chat, in a
command, or in a file you write; that holds without exception. And **the sign-in is the user's**:
they run `asg login` and you verify the result. You may offer to run it for them (below), but only
the browser path, and only when they ask you to.

## 1. Check for a session

```bash
asg status
```

Authenticated → done, skip the rest. No session (or an error) → step 2.

## 2. The user logs in

Nothing can be created, inspected, or verified without a session, so send one short message —
what to run and why — and stop there. The user has one thing to do; make it the only thing on
screen:

> Before I can set anything up in Asgardeo I need a session on your org. Run `asg login` — it asks
> for your organization name, then opens a browser to sign in. Tell me when you're through, or give
> me the org name and I'll start it for you.

**If they would rather you ran it**, that is fine — ask, don't assume, and the organization name is
the only thing you need from them. It is never yours to guess: `asg login --org-name <what they
gave you>`, then tell them a browser is opening and to sign in there, and confirm with `asg status`
once they say they are through.

Two limits on that. **Only this path** — never `--m2m-application`, and never a command carrying a
client secret; that one is theirs regardless of what they offer. And if the browser does not open,
or the command does not complete, **hand it back** instead of debugging their sign-in: give them the
URL and user code the CLI printed, and let them finish in their own terminal. Running it yourself is
a convenience, not something to defend when it goes wrong.

Why the default is still that they run it: the command blocks while it polls, so the URL and code
land in your tool output rather than in their terminal — which matters exactly when the CLI cannot
open a browser for them — and a failure there (CLI access off, wrong organization) is one only they
can fix.

What they'll see: the CLI asks for their **root organization name** — they can skip that prompt by
passing `--org-name <org>` — then opens the browser at the sign-in page with the device code
pre-filled; they sign in with their Asgardeo credentials and the terminal completes on its own.
Signing in as themselves is the default and needs no choosing; `--m2m-application` is the opt-in for
the machine path. (If no browser can open — SSH, headless —
the CLI prints the URL and code to use from any device, and keeps waiting.)

**If login stops with "CLI access is turned off for this organization"**, nothing about the command
is wrong: CLI access is on by default only for organizations created after CLI support shipped, and
an older one has to turn it on once in the Asgardeo Console, on the CLI tab. The CLI detects this
before opening a browser and prints the steps. The user enables it and re-runs `asg login` —
don't re-run it for them, and don't try another org name or server URL, which will not help.

Two special cases:

- **Self-hosted WSO2 Identity Server:** add `--server identity-server --identity-server-url <url>`
  (org is typically `carbon.super`).
- **CI / no human available:** machine login with a pre-created M2M app authorized for the needed
  management APIs — run by the user or CI, never the agent, because the secret rides in the command
  line:
  ```bash
  asg login --org-name <org> --client-id <id> --client-secret <secret> --no-interactive
  ```

## 3. Verify and continue

```bash
asg status
```

Confirm it shows the expected organization, then proceed. Don't continue past a failed check.

## Sessions renew themselves

Access tokens expire hourly, but the CLI refreshes them silently — a session stays usable across a
long task with no re-login. Two consequences:

- A **"session has expired" error** means the silent refresh itself failed (refresh token expired or
  revoked): ask the user to run `asg login` again.
- A **403 is never a session problem** — it's a missing permission on the signed-in user's role, and
  re-login won't change it. See "When a command fails" in `cli-overview.md` instead of looping on login.

## Signing out

```bash
asg logout
```

Clears the stored tokens (including the refresh token).

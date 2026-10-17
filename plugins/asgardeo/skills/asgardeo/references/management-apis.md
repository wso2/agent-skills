# Beyond the CLI's verbs — driving any management API with `asg api`

The CLI has first-class verbs for apps, users, groups, roles, APIs/scopes, orgs, branding, IdPs, and
agents. Asgardeo's management surface is much wider — and almost all of it is a REST API that
`asg api` (the CLI's authenticated escape hatch) can call. So when the user asks for something with no
dedicated verb, the answer is usually *"yes, via the management API"*, not *"use the Console"*.

## The pattern

1. **Find the API** in the routing table below.
2. **Fetch its doc page** to get the exact paths and payload shapes — don't guess them:
   `https://wso2.com/identity-platform/docs/apis/<slug>.md` (the markdown twin of the page)
3. **Call it:**
   ```bash
   asg api /api/server/v1/<path> -X GET
   asg api /api/server/v1/<path> -X POST -b '<json>'     # -b @file.json for large payloads
   ```
   Paths starting `/api/`, `/scim2/`, or `/scim/` are passed through as-is (relative to the tenant
   base URL). `-r` prints the raw body; `-q key=value` adds query params.
4. **Confirm before mutating.** A raw POST/PATCH/DELETE has no CLI-side confirmation prompt — state
   what will change and get the user's explicit OK first, exactly as for a `delete` verb.

Scope note: a 403 here means the signed-in user's role lacks that permission (see "When a command
fails" in `cli-overview.md`), not that the API route is wrong.

## Routing table — feature area → management API

Doc slugs append to `https://wso2.com/identity-platform/docs/apis/`.

| User asks about… | API (doc slug) |
|---|---|
| Consent management | `consent-management-v2-api-definition/` |
| Identity verification providers | `identity-verification-providers/` (admin ops: `admin-identity-verification/`) |
| Email templates | `email-template/` |
| Notification senders (email/SMS channels) | `notification-sender-v2-rest-api/` |
| Notification templates | `notification-templates/` |
| Login/registration governance (password policies, self-registration, account locking) | `identity-governance/` |
| User sessions (list/kill) | `session/` |
| User stores | `user-store/` |
| Claims / attribute dialects | `attribute-management/` |
| Webhooks | `webhook-management-rest-api/` |
| Actions (pre-issue token hooks etc.) | `action-management-rest-api/` |
| Account recovery | `user-account-recovery/` |
| User account associations | `association-management-by-admin/` |
| Idle account identification | `idle-account-identification/` |
| Organization discovery (email-domain routing) | `organization-discovery/` |
| Dynamic client registration | `dynamic-client-registration-rest-api/` |
| Verifiable credential templates | `vc-template-management-rest-api/` |
| SCIM bulk / batch operations | `scim2/scim2-bulk-rest-api/`, `scim2/scim2-batch-operations/` |

Full catalog (anything not listed): `https://wso2.com/identity-platform/docs/apis/`.

## Genuinely Console-only — hand off, don't improvise

A few things are interactive UI experiences with no usable API route; send the user to the Console
(`asg apps settings` / `asg orgs settings` deep-link where possible) and say so plainly:

- **Login Flow Builder / Login Flow AI** — visual flow design. (The resulting `authenticationSequence`
  *is* editable via `asg apps update --edit "authenticationSequence=@seq.json"`; see
  `authentication-methods.md`.)
- **Branding AI** — generated branding. (Manual branding is `asg branding`.)
- **Creating social/enterprise connections** — the Console wizard handles the provider handshake;
  the CLI can then list/reference them (`asg idps list`).
- **Reading an app's client secret** — deliberately Console-only in this skill: never round-trip
  secrets through chat.

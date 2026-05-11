---
name: api-design
description: >
  Use this skill to design an OpenAPI specification from scratch, assess an existing spec for
  AI agent readiness / security / design quality, or fix issues found in a spec.
  Trigger when the user describes an API they want to build, asks to "design", "create",
  "draft", or "scaffold" an OpenAPI spec, or mentions building a REST API for a service or
  domain. Also trigger when the user says things like "I want to expose endpoints for X",
  "help me design an API for Y", or "I need an OpenAPI spec for Z" — even if they don't say
  "OpenAPI" explicitly.
  ALSO trigger when the user asks to evaluate, review, check, or assess an OpenAPI spec for
  agent compatibility, API quality, security, OWASP compliance, WSO2 guidelines, or REST best
  practices — or when they share a .yaml/.json OpenAPI file and ask how good it is.
  ALSO trigger when the user asks to fix, correct, remediate, or apply fixes to issues in
  an OpenAPI spec — including "fix issue spec-001", "fix all HIGH severity issues",
  "apply autoFixable fixes", or "fix the spec issues from this report".
---

# API Design

You help with everything in the OpenAPI spec lifecycle: designing specs from scratch,
assessing existing specs across three dimensions (AI Agent Readiness, Security Readiness,
API Design Guidelines), and applying fixes.

**Determine what the user needs:**

- **Design**: user describes an API they want to build → go to **Design Workflow** below
- **Assess / Fix**: user shares or references an existing spec → go to **Assessment Workflow** below
- **Design then assess**: user wants both — complete the design first, then proceed to assessment

---

## Design Workflow

You help the user design an OpenAPI 3.x specification from scratch through a guided,
conversation-driven process grounded in the WSO2 REST API Design Guidelines. The output
is a production-quality YAML file that follows those guidelines and is ready for AI agent use.

`references/wso2-rest-api-design-guidelines.md` is the source of truth for WSO2 design
process, resource taxonomy, URI rules, HTTP semantics, and special behaviour patterns.
Consult it section-by-section when each step needs it:
- resource taxonomy at Step 3
- URI rules and HTTP semantics at Step 4
- error schema, special behaviour, and security placement at Step 6

**Your approach:**
1. Understand the domain
2. Understand the data model (entities, relationships — conversationally)
3. Derive resources and confirm them with the user
4. Produce a full outline (representations, URIs, methods, special behaviour, errors)
5. Refine iteratively until the user is satisfied
6. Generate the final OpenAPI YAML
7. Offer assessment

---

### Step 1 — Understand the domain

If the user hasn't already described their API, ask one simple question:

> "What would you like to build? Describe your service in a sentence or two."

The goal here is just to get a feel for the domain. Do not ask about resources, auth,
versioning, or non-CRUD actions yet — those emerge naturally in the steps that follow.

---

### Step 2 — Understand the data model

Before making any resource or URI decisions, understand what data the system manages.
Ask the user to describe this in plain language:

> "Before I design the resources, I need to understand what your system manages and
> how things relate to each other. Describe your data in plain language — for example:
> 'A customer owns a shopping cart. The cart has items. Each item refers to a product.'
> You don't need to be technical — just tell me what the main things are and how they connect."

From the user's response, infer:
- The key entities (e.g., Customer, Cart, CartItem, Product)
- The relationships between them (e.g., Cart belongs to Customer, CartItem belongs to Cart)
- Any business actions implied (e.g., "checkout" suggests a multi-step operation beyond CRUD)

Reflect back a short summary and ask for confirmation:

> "Here's what I understand:
> - **Customer** — owns a shopping cart
> - **Cart** — belongs to a customer; contains items
> - **CartItem** — belongs to a cart; references a product
> - **Product** — standalone catalog entry
>
> Does this look right? Anything missing or different?"

Adjust based on their reply. When the entity model is confirmed, move to Step 3.

---

### Step 3 — Derive and confirm the resources

Internally apply the WSO2 resource taxonomy (from `references/wso2-rest-api-design-guidelines.md`)
to map each entity and business action to the right resource type and URI. Do this reasoning
silently — do not explain the taxonomy categories to the user.

Then present a clean resource table — just URIs and HTTP methods — and ask for confirmation:

> "Based on your data model, here are the resources I'd design:
>
> ```
> GET    /products                              — List all products
> POST   /products                              — Add a product
> GET    /products/{productId}                  — Get a product
> PUT    /products/{productId}                  — Update a product
> DELETE /products/{productId}                  — Remove a product
>
> GET    /customers/{customerId}/cart            — Get a customer's cart
> POST   /customers/{customerId}/cart/items      — Add an item to the cart
> DELETE /customers/{customerId}/cart/items/{itemId} — Remove an item from the cart
>
> POST   /customers/{customerId}/cart/checkout   — Checkout the cart
> ```
>
> Do these look right? Anything missing, renamed, or that doesn't fit?"

Wait for confirmation or corrections before proceeding. If the user requests changes,
update the resource list and show the revised version. Only move to Step 4 once the
user is happy with the resources.

---

### Step 4 — Produce the outline

Before building the outline, use everything gathered in Steps 1–3 to infer sensible
defaults for the remaining design decisions, then confirm with the user:

> "Before I build the outline, here's what I'm planning — let me know if anything should change:
>
> - **Format** — JSON only. <add XML if context suggests it, e.g. enterprise/B2B integrations>
> - **Version** — v1.0.
> - **Authentication** — <suggest based on context, e.g. "OAuth2, since this API has
>   user-owned resources" or "API key, since this looks like a B2B service API">
> - **Pagination** — limit/offset on <list the collection endpoints that warrant it>.
>   <omit if there are no collection GETs>"

If the user confirms or says "looks good", proceed. If they correct anything, fold it in.

Build the full API outline from the confirmed resources. This is the last checkpoint before
YAML generation — it should be complete enough that no further guessing is needed.

The outline covers all remaining WSO2 design decisions:

```
## API Overview
Name: <api-name>
Base path: /<feature-code>/v1.0
Purpose: <one-line description>

## Resources & Operations
<list all confirmed resources with their HTTP methods and a brief description of each>
(note where pagination applies, where long-running 202 applies, where concurrency matters)

## Representations
- Format: JSON (application/json)
- Key schemas:
  - <ModelName>: <field> (<type>), <field> (<type>), ...
  (3–5 most important fields per model — not exhaustive)

## Special Behaviour
- Pagination: limit (default 20) + offset (default 0) on collection GETs;
  response envelope: { count, next, previous, data: [...] }
- <any long-running operations>: 202 Accepted + Content-Location for polling
- <any resources needing concurrency control>: If-Match / If-Unmodified-Since headers

## Auth
- <recommended scheme and why>

## Errors
- Schema: { code (integer), message (string), description (string, optional),
            moreInfo (string, optional) }
- Standard responses: 400, 401, 403, 404, 429 (with Retry-After), 500
```

After presenting:

> "Does this outline look good, or would you like any changes before I generate the spec?"

---

### Step 5 — Refine iteratively

Accept natural language changes and update only the changed sections of the outline.
After each change:

> "Updated. Anything else, or ready to generate?"

When a user request conflicts with WSO2 guidelines (e.g., camelCase paths, verbs in
collection URIs), briefly note it and apply what they want if they still prefer it:

> "WSO2 guidelines recommend kebab-case paths — I'd suggest `/order-items` rather than
> `/orderItems`. Want me to apply the guideline, or keep your preference?"

---

### Step 6 — Generate the OpenAPI YAML

When the user approves the outline, tell them:

> "Generating your OpenAPI spec…"

Generate a complete OpenAPI 3.x YAML. The spec must meet WSO2 design guidelines and AI
agent readiness checks out of the box — it should score well on assessment without requiring fixes.

**Structure:**
- `openapi: "3.0.3"`
- `info`: title, description (50+ chars covering purpose, consumers, and primary use cases), version (`v1.0`), contact (name + email)
- `servers`: at least one entry with a description (e.g., "Production API")
- `tags`: one per resource group, alphabetically sorted, each with a description
- `paths`: all operations from the approved outline
- `components.schemas`: all models plus the shared Error schema
- `components.securitySchemes`: appropriate scheme(s)

**Per operation:**
- `operationId`: camelCase verb + noun (e.g., `listProducts`, `createOrder`, `getOrderById`)
- `summary`: imperative verb phrase describing the business action
- `description`: what the operation does and when an agent should call it (2–3 sentences)
- `tags`: the resource group tag
- `parameters`: path params at the **path level**; query params at the operation level; for collection GETs add `limit` (integer, default 20) and `offset` (integer, default 0) with descriptions and examples
- `requestBody` (POST/PUT): schema `$ref` plus a concrete inline example
- `responses`:
  - Collection GET: 200 with envelope `{ count, next, previous, data: [...] }`
  - POST (factory/create): 201 + `Location` header pointing to the new resource
  - PUT: 200 with updated resource representation (full replace, idempotent)
  - DELETE: 204 No Content
  - Long-running POST: 202 Accepted + `Content-Location` header for polling
  - 400, 401, 403, 404: reference the shared `Error` schema
  - 412: for resources with concurrency control (`If-Match` / `If-Unmodified-Since`)
  - 429: reference `Error` schema, include `Retry-After` response header
  - 500: reference `Error` schema

Apply all WSO2 design rules from `references/wso2-rest-api-design-guidelines.md` (URI format, casing, noun/verb rules, parameter placement, schema conventions, error schema, security placement).

**YAML hygiene for prose values.** Inline `example:`, `description:`, `summary:`, and similar string fields are where parse errors creep in — and they're expensive to repair from context in a 40k-line spec. Apply one simple rule:

> **Any string value that contains prose with punctuation must be double-quoted** (or written as a `>-` block scalar). "Prose with punctuation" means anything that isn't a bare alphanumeric word.

Characters that *will* confuse the YAML parser if left in an unquoted string include — but are not limited to — apostrophes (`'`), backticks (`` ` ``), angle brackets (`< >`), curly braces (`{ }`), square brackets (`[ ]`), a leading dash (`-`), a colon followed by a space (`: `), a `#`, and starting with `> | & * ! % @ ?`. Examples of values that need double-quoting:

```yaml
# wrong — bare apostrophe starts a single-quoted scalar; rest of line breaks the parser
description: 'amount' must be greater than zero.

# wrong — backticks and angle brackets confuse the parser
description: Pass as `Authorization: Bearer <token>`.

# right
description: "'amount' must be greater than zero."
description: "Pass as `Authorization: Bearer <token>`."
description: >-
  Long multi-line prose with any punctuation works fine
  inside a block scalar without escaping.
```

Also keep example **shapes** matching their schema: don't write `example:` as a YAML sequence (`- ...`) under a schema whose `type` is `object`. The shape of the example must match the schema; mismatches confuse both YAML parsers and downstream tools.

When generating the spec, default to double-quoted strings for any `description`/`summary`/`example` value containing prose. It costs one extra character per field and eliminates an entire failure class.

**Pagination envelope.** This is the most-frequently-missed item from the outline. Every collection GET response must use the `{ count, next, previous, data: [...] }` envelope shape from Step 4, not a bare array. If the schema for a list response is `type: array`, that's wrong — wrap it in an object with the envelope fields.

Save the file as `<api-name>-openapi.yaml` in the current directory. Tell the user:

> "Saved to `<filename>.yaml`."

---

### Step 7 — Offer assessment

> "Would you like me to assess this spec for AI agent readiness, security, and design quality?"

If yes: proceed to the **Assessment Workflow** below.

---

## Assessment Workflow

You are an API readiness assessor and fixer. You can either assess an OpenAPI specification
(run checks and produce a report) or fix issues in one (edit the spec file in place).

**Your approach:**
1. Accept the spec file path
2. Determine intent: **assess** (run checks) or **fix** (apply fixes to existing issues)
3. For assessment: run the requested dimension(s) and produce a report
4. For fixing: follow the Fix Workflow — never apply fixes without user confirmation

---

### Input

If the user has not already provided a spec, ask:

> "Please share the file path to your OpenAPI spec."

The skill works against an on-disk file because both assessment and fix flows read and edit it directly. If the user offers to paste content instead, redirect them: ask them to save it to a file first and share the path. They can save it anywhere — the report will be written to `./api-reports/` next to wherever they're working.

**Determine intent** — before proceeding, decide whether the user wants to assess or fix:

- **Fix intent**: user says "fix", "correct", "apply fixes", "remediate", "patch", provides issue IDs (e.g. "fix spec-001"), or the message comes from the VS Code extension webview with a report path → skip directly to the **Fix Workflow** section.
- **Assess intent**: user says "check", "assess", "review", "evaluate", or shares a spec without fix language → continue below to confirm which checks to run.

**Confirm which checks to run** (assess path only) — infer from the user's message first. Only ask if the intent is genuinely ambiguous.

**Infer without asking when the user mentions:**
- "agent readiness", "AI readiness", "LLM", "tool use", "agent", "agent-friendly" → run **AI Agent Readiness** only
- "security", "OWASP", "vulnerabilities", "auth" → run **Security Readiness** only
- "design", "design guidelines", "WSO2 guidelines", "REST best practices", "API design" → run **API Design Guidelines** only
- "all", "everything", "all three", "full assessment" → run all three
- Combination phrases → run the mentioned dimensions

**Ask only when the user shares a spec without any dimension hint:**

> "What would you like to check?
> - **API Design Guidelines** — WSO2 REST design rules (28 checks)
> - **Security Readiness** — OWASP-derived API security checks
> - **AI Agent Readiness** — Spectral rules (69 checks) + AI analysis (11 guideline categories)
>
> You can pick one, a few, or all three."

Wait for the user's reply before proceeding.

---

### Preflight — Spectral availability

Spectral is required for every dimension (AI Agent Readiness, Security, Design). Verify it's installed *before* doing any LLM work, so a missing tool surfaces immediately instead of after a multi-minute analysis:

```bash
spectral --version
```

If the command fails or is not found, stop and tell the user:

> "Spectral CLI is required for this assessment. Install it with:
> `npm install -g @stoplight/spectral-cli`
> Then confirm here."

Wait for confirmation, then re-run `spectral --version` before continuing. Don't proceed to LLM analysis or the `assess.js` invocation until this passes — `assess.js` has its own internal preflight as a safety net, but catching the issue here saves the LLM tokens that the AI analysis would otherwise spend.

---

### AI Agent Readiness — LLM Analysis

**Skip this section entirely if AI Agent Readiness was not requested** (e.g. security-only or design-only run) — go straight to **Output**.

The mechanical part (Spectral, report assembly, HTML, summary) all happens in a single `assess.js` call in **Output** below. The LLM analysis is the only piece you do in-context, and it must happen *before* that call so its result can be passed in.

Tell the user:

> "Running AI analysis — reviewing spec against 11 agent-readiness guideline categories…"

Read `references/agent-readiness-guidelines.md` in full.

Walk all 11 categories in order. For each rule, inspect every relevant part of the spec (operations, parameters, schemas, response codes, paths). Be thorough — do not skip categories even if they seem unlikely to apply.

For each violation found, record an object with these fields (no `id` — `assess.js` assigns IDs and sorts):

- **`severity`**: as defined in the guidelines (CRITICAL / HIGH / MEDIUM / LOW).
- **`rule`**: the rule reference from the guidelines, e.g. `Rule 3.3`.
- **`path`**: JSON path to the affected element, e.g. `paths./orders.post`.
- **`issue`**: a concise description of what is wrong.
- **`description`**: the agent impact — what an agent will do wrong because of this violation.
- **`fixSuggestion`**: a concise, actionable description of what to change.

When all violations are found, use the **Write** tool to save the array as `./api-reports/ai-issues.json` (the Write tool will create `./api-reports/` if it doesn't already exist). Pass `--ai-issues ./api-reports/ai-issues.json` to `assess.js` in the Output section. `assess.js` deletes the file after a successful run; the report stays.

Why this path: it's relative (works the same on macOS, Linux, and Windows), and it goes into the same `./api-reports/` directory the final report lands in — so the path on the Write permission prompt is one the user already expects to see. This avoids the long inline JSON in the Bash prompt and the cross-platform mess of resolving a temp directory.

---

### Security Readiness & API Design Guidelines

These dimensions are purely mechanical — Spectral only, no LLM step. They run as part of the single `assess.js` call in **Output**. Don't pre-announce them — `assess.js` prints its own per-dimension progress lines (`Running security rules (OWASP-derived)...`, `Running design guidelines rules (WSO2 REST)...`) when it actually runs them. Pre-announcing creates a "complete" feel before the work happens, which confuses the user when they then see the Spectral lines.

---

### Output

Do not produce the final report until any required LLM analysis (above) is complete. Brief status updates ("Running AI analysis…") *during* the LLM walk-through are fine; do not narrate "complete" or "generating report" *before* invoking the script — `assess.js` does the Spectral runs itself, and a premature "complete" message contradicts the lines the user is about to see.

Invoke a single command. `assess.js` runs each requested ruleset, merges in the LLM analysis (if `--ai-issues` is given), assembles the report, generates HTML, prints a summary, and optionally opens the HTML in the browser — all in one process, one Bash approval. Spectral availability has already been verified in the **Preflight** step, so don't re-run `spectral --version` or do other defensive checks (`ls` of the script, etc.) here.

```bash
node <absolute-path-to-skill>/scripts/assess.js \
  --spec <spec-file-path> \
  --skill-dir <absolute-path-to-skill> \
  --meta '{"specFile":"<path>","assessedAt":"<ISO-8601-UTC>","spectralVersion":"<version>","guidelinesVersion":"agent-readiness-guidelines.md","model":"claude-sonnet-4-6"}' \
  [--agent] [--security] [--design] \
  [--ai-issues ./api-reports/ai-issues.json] \
  [--open]
```

Notes:

- Pass exactly the dimension flags the user requested. At least one is required.
- `--ai-issues ./api-reports/ai-issues.json` is required when `--agent` is set — the file you wrote in the **AI Agent Readiness — LLM Analysis** section. `assess.js` deletes that file after a successful run. Omit `--ai-issues` entirely for security-only or design-only runs.
- `--spec` is the file path the user provided.
- `--open` opens the HTML in the default browser when running in CLI/standalone chat. Skip it inside the VS Code API Designer extension (`openInApiDesigner` handles the webview instead).
- If Spectral is not installed, `assess.js` exits 1 with `npm install -g @stoplight/spectral-cli` as the install hint. Surface that to the user, wait for them to install, then re-run.

Show the script's stdout verbatim as the response. The script prints the report and HTML paths at the end — use those for the next step.

**Step 2 — Offer next steps**

**If running inside the VS Code API Designer extension** (`openInApiDesigner` tool is present in your tools list):
- Call `openInApiDesigner` with no arguments — the extension opens the report webview immediately.
- Then ask: *"Would you also like to apply fixes to your spec?"*
- If yes: proceed to **Fix Workflow**.

**If running in CLI or standalone chat mode** (`openInApiDesigner` is not available):
- If you didn't already pass `--open` above, ask: *"Would you like to open the full HTML report in your browser?"* — if yes, open the HTML path that `assess.js` printed using the platform-appropriate command (no need to re-run `assess.js` — the file is already on disk):
  - macOS: `open <html-path>`
  - Linux: `xdg-open <html-path>`
  - Windows: `start <html-path>`
- Then ask: *"Would you like to apply fixes to your spec?"*
- If yes: proceed to **Fix Workflow**.

---

## Fix Workflow

This workflow applies in two situations:
- **Post-assessment**: after delivering the summary, the user says "yes, fix" or "apply fixes"
- **Direct trigger**: invoked for fixing directly (e.g. from the VS Code extension webview)

Fixes are always applied in-place to the spec file at the path the user provided.

---

### Step 1 — Resolve the issue list

You need a list of issues to fix. Resolve from the first available source:

1. **Post-assessment**: issues are already in context from the report just generated — use those.
2. **Report path provided**: read the JSON report file and collect all issues from all sections (`agentReadiness.spectral.issues`, `agentReadiness.aiAnalysis.issues`, `securityReadiness.spectral.issues`, `designReadiness.spectral.issues`).
3. **Issue IDs specified**: user said "fix spec-001 and des-003" — filter to those IDs from the report.
4. **Severity filter**: user said "fix all HIGH" — filter accordingly.
5. **"All autoFixable"**: filter to issues where `autoFixable: true`.

If none of the above apply and no report exists, ask:
> "Do you have an assessment report JSON? If so, share the path. If not, I can run an assessment first."

**Exception — "all autoFixable" or "all HIGH" without a report.** Condition 5 (and "all HIGH"-style filters) can't be evaluated without an assessment report. If the user has clearly opted in to fixing without a report — e.g. *"apply all autoFixable fixes to my-spec.yaml"* — don't ask; just run the assessment yourself via the Assessment Workflow's **Output** step (one `assess.js` invocation with `--agent --security --design`, no manual `spectral` calls needed), then use that fresh report as the issue source and continue with Step 2 below.

---

### Step 2 — Read the spec

Read the spec file in full. Keep it in context — you'll make multiple targeted edits.

---

### Step 3 — Categorize the issues

Separate the issues to fix into three groups:

**A. Safe structural** — `autoFixable: true`, and the rule is NOT a path-rename rule:
Add or edit fields without changing path keys. Examples: add `operationId`, add `type: object` to a schema, add a 429 response with `Retry-After` header, sort tags alphabetically.

**B. Path-renaming** — rules `paths-no-trailing-slash`, `path-casing`, `paths-no-http-verbs`:
These rename path keys, which breaks existing API consumers. Handle separately with a warning.

**C. LLM-generated content** — `autoFixable: false`:
Descriptions, summaries, examples, contact info, security scheme descriptions. The LLM generates appropriate values based on the spec context.

---

### Step 4 — Apply safe structural fixes

For each issue in group A, in order:

1. Parse the `path` field (dot-notation like `paths./orders.post.operationId`) to locate the element in the spec. The path segments map to nested YAML/JSON keys: `paths` → `/orders` → `post` → `operationId`.
2. Read the `fixSuggestion` to know exactly what to add or change.
3. Apply a minimal, targeted edit using the Edit tool — change only the flagged element, leave surrounding content untouched.
4. Note the issue ID as fixed.

---

### Step 5 — Handle path-renaming fixes (with confirmation)

If group B has any issues, present the proposed renames before applying:

> "The following fixes rename path URLs. This is a **breaking change** for any existing clients using these endpoints:
> - `/users/` → `/users` (trailing slash removal)
> - `/getUsers` → `/users` (HTTP verb removal)
>
> Confirm to apply, or say 'skip' to leave these unchanged."

If confirmed: rename the path keys in the spec. Path keys appear under `paths:` and may also appear in `$ref` strings elsewhere — rename both occurrences.

---

### Step 6 — Apply LLM-generated content fixes

For each issue in group C:

1. Read the `fixSuggestion` and the surrounding spec at the issue's `path` for context.
2. Generate appropriate content — write descriptions that reflect the actual operation, examples that match the schema, etc. Don't use placeholder text like "TODO" or "description here".
3. Apply via Edit tool.

If there are more than 5 issues in group C, show your planned content for each before applying:

> "I'll add the following content — confirm to apply, or let me know what to change:
> - `paths./users.get.description`: "Returns a paginated list of all registered users."
> - `paths./users.post.description`: "Creates a new user account."
> ..."

---

### Step 7 — Summary

After all edits are complete:

> "Fix complete.
> **Applied (N issues):** spec-001, des-003, ai-007 …
> **Skipped — path-rename (N):** des-010, des-011 (not confirmed)
> **Requires manual action (N):** sec-001 — OAuth scheme configuration requires architectural decisions; see the fixSuggestion in the report.
>
> The spec at `<path>` has been updated in place."

OWASP security issues and any issue where the fix requires domain knowledge beyond what's in the spec (e.g. actual server URLs, real contact details) should be listed under "requires manual action" rather than guessed.

---

## Reference files

Read these when needed — don't load all of them upfront:
- `references/wso2-rest-api-design-guidelines.md` — WSO2 7-step design process, resource taxonomy, URI rules, HTTP semantics, special behaviour, errors; read at the start of the Design Workflow
- `references/agent-readiness-guidelines.md` — 11 LLM analysis categories for AI Agent Readiness (Phase 2)
- `references/ai-readiness-metadata.json` — metadata for 69 Spectral AI-readiness rules
- `references/owasp-top-10-metadata.json` — metadata for the OWASP-derived API security rules
- `references/wso2-design-guidelines-metadata.json` — metadata for WSO2 REST design rules
- `references/report-schema.md` — JSON report structure documentation

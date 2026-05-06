# Assessment Report JSON Schema

The assessment output is a single JSON object with this top-level shape:

```
{
  meta              — run metadata
  agentReadiness    — present when agent readiness was assessed
  securityReadiness — present when security readiness was assessed
  designReadiness   — present when API design guidelines were assessed
}
```

---

## `meta`

```json
{
  "meta": {
    "specFile": "path/to/openapi.yaml",
    "assessedAt": "2026-04-25T10:30:00Z",
    "spectralVersion": "6.15.1",
    "guidelinesVersion": "agent-readiness-guidelines.md",
    "model": "claude-sonnet-4-6"
  }
}
```

| Field | Description |
|---|---|
| `specFile` | File path provided, or `"pasted-content"` if pasted |
| `assessedAt` | ISO 8601 UTC timestamp of the assessment run |
| `spectralVersion` | Output of `spectral --version`, or `"not-run"` if Spectral was skipped |
| `guidelinesVersion` | Always `"agent-readiness-guidelines.md"` |
| `model` | Claude model ID used |

---

## `agentReadiness`

Present only when an AI Agent Readiness assessment was requested.

```json
{
  "agentReadiness": {
    "spectral": { ... },
    "aiAnalysis": { ... }
  }
}
```

### `agentReadiness.spectral`

Results from running Spectral with the `ai-readiness.yaml` ruleset (69 automated rules).

```json
{
  "status": "completed",
  "ruleset": "references/agent-readiness-spectral/ai-readiness.yaml",
  "score": {
    "critical": 2,
    "high": 5,
    "medium": 3,
    "low": 8,
    "score": 73
  },
  "issues": [ ... ]
}
```

### `agentReadiness.aiAnalysis`

Results from the LLM-based guideline review (11 categories from `agent-readiness-guidelines.md`).

```json
{
  "status": "completed",
  "score": {
    "critical": 1,
    "high": 2,
    "medium": 0,
    "low": 1,
    "score": 73
  },
  "issues": [ ... ]
}
```

---

## `securityReadiness`

Present only when a Security Readiness assessment was requested.

```json
{
  "securityReadiness": {
    "spectral": {
      "status": "completed",
      "ruleset": "references/owasp-top-10-raw.yaml",
      "score": {
        "critical": 0,
        "high": 3,
        "medium": 0,
        "low": 0,
        "score": 88
      },
      "issues": [ ... ]
    }
  }
}
```

---

## `designReadiness`

Present only when an API Design Guidelines assessment was requested. Spectral-only (no LLM analysis) — runs the WSO2 REST design ruleset (28 rules).

```json
{
  "designReadiness": {
    "spectral": {
      "status": "completed",
      "ruleset": "references/wso2-design-guidelines-raw.yaml",
      "score": {
        "critical": 0,
        "high": 2,
        "medium": 4,
        "low": 1,
        "score": 88
      },
      "issues": [ ... ]
    }
  }
}
```

---

## Issue Object

All three sections use the same issue shape:

```json
{
  "id": "spec-001",
  "severity": "CRITICAL",
  "rule": "ai-readiness-operation-id",
  "path": "paths./orders.post.operationId",
  "issue": "Operation must have an operationId for AI readiness",
  "description": "operationId is how agents reference tools. Without it, the agent cannot reliably call the operation.",
  "fixSuggestion": "Add an operationId using verb-noun format, e.g. 'createOrder'.",
  "autoFixable": true
}
```

| Field | Description |
|---|---|
| `id` | Sequential, zero-padded: `spec-NNN` (Spectral AI), `ai-NNN` (LLM analysis), `sec-NNN` (OWASP), `des-NNN` (WSO2 design) |
| `severity` | `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` |
| `rule` | Spectral rule code or guideline reference (e.g. `Rule 3.3`) |
| `path` | JSON path to the affected element (e.g. `paths./orders.post`) |
| `issue` | Concise description of what is wrong |
| `description` | Why this matters for agent behavior |
| `fixSuggestion` | Actionable description of what to change |
| `autoFixable` | `true` if a script can apply the fix without domain knowledge |

---

## Score

Each section's `score.score` is an integer in `[0, 100]`, computed independently per dimension:

```text
score          = round( (totalRules − Σ rulePenalty) / totalRules × 100 ), clamped to [0, 100]
rulePenalty    = max( SEVERITY_PENALTY across that rule's violations )
SEVERITY_PENALTY = { CRITICAL: 1.0, HIGH: 0.6, MEDIUM: 0.3, LOW: 0.15 }
```

Multiple violations of the same rule contribute at most one rule's worth of penalty
(the worst-severity one), so issue counts and the score don't diverge artificially
when one bad rule produces many findings.

`totalRules` per dimension:

| Dimension                        | Total | Source |
|----------------------------------|------:|---|
| `agentReadiness.spectral`        | 69    | `references/ai-readiness-metadata.json` (one entry per rule) |
| `agentReadiness.aiAnalysis`      | 26    | `### Rule N.M` headings counted in `references/agent-readiness-guidelines.md` |
| `securityReadiness.spectral`     | 15    | `references/owasp-top-10-metadata.json` (one entry per rule) |
| `designReadiness.spectral`       | 28    | `references/wso2-design-guidelines-metadata.json` (one entry per rule) |

> **Maintainer note — adding or removing rules.** `assess.js` reads these counts at runtime, so the score formula picks up new totals automatically the next time you run an assessment. The numbers in the table above are documentation only — when you add or remove rules, **update this table** so it doesn't drift from reality. If you add a brand-new dimension (a fourth Spectral ruleset, say), document its `totalRules` source the same way and add a row. Don't hard-code rule counts anywhere in `assess.js` — keep them derived from the source files.

# Evaluating Skills with Promptfoo

This repo uses [promptfoo](https://github.com/promptfoo/promptfoo) (MIT, installed
separately) to evaluate skills. An eval runs a skill the way it actually runs in
production — the agent SDK discovers the skill from a fixture workspace and
invokes it — then asserts on what the agent does. Promptfoo is a developer/test
tool here: we ship eval configs and fixtures, contributors run promptfoo locally.

## Where evals live

Each skill carries its own suite as a sibling of `SKILL.md`:

```text
plugins/<plugin>/skills/<skill>/
  SKILL.md  references/  scripts/  assets/
  evals/
    promptfooconfig.yaml
    tests/
      triggering.yaml      # does the skill activate on the right prompts?
      task-quality.yaml     # is the skill's output correct?
    fixtures/workspace/      # a self-contained workspace the agent runs in
      .claude/skills/<skill>/   # Claude discovery path (real copies)
      .agents/skills/<skill>/   # Codex discovery path (real copies)
    package.json
    README.md
```

Two repo-level tools (under `tools/`) operate on these suites:
`scaffold-eval.js` creates one, and `sync-fixtures.js` refreshes the fixture
copies from the live skill.

## Prerequisites (once per machine)

- **Node `>= 22.22`** — promptfoo's minimum runtime.
- **promptfoo** — you don't need to install it; the commands here run it via
  `npx promptfoo@latest`, which fetches it on demand. If you prefer, you can
  install it globally (`npm install -g promptfoo`) and call `promptfoo` directly.
  Either way, pin a version for reproducible runs (`@<version>` or a specific
  global version). Note: a suite's own `npm install` only pulls the agent SDK(s)
  the providers need — not promptfoo.
- **Auth** — either run `claude` (Claude) and/or `codex` (Codex) once to reuse
  your interactive login, or export `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.

## Scaffold a new suite

Don't hand-build the fixture plumbing — generate it. Run from the repo root:

```bash
node tools/scaffold-eval.js <plugin> <skill> [--providers <list>] [--grader <provider>]
```

(The script anchors its paths to its own location, so it works from any
directory if you give the right path to it — but the repo root is simplest, and
the paths it prints are relative to the repo root.)

For example, to scaffold a suite for the `api-design` skill (in the
`api-platform` plugin), evaluated under both Claude and Codex:

```bash
node tools/scaffold-eval.js api-platform api-design --providers claude,codex
```

This writes `plugins/api-platform/skills/api-design/evals/`.

`--providers` takes a comma-separated list of agents to evaluate under, e.g.
`claude` (default) or `claude,codex`. This creates `evals/` with a working
config, copies the skill into a fixture workspace per provider, and drops starter
tests with TODOs. You fill in the test cases.

`--grader` picks the provider for model-graded (`llm-rubric`) assertions —
`claude` by default, or `codex`. It's kept to a single provider so scores stay
comparable across the providers-under-test, but you can change it (e.g. a
codex-only suite can use `--grader codex` to avoid depending on Claude at all).

## What to test — two dimensions

Every skill suite should cover both:

1. **Triggering / routing** (`tests/triggering.yaml`)
   - A prompt that **should** activate the skill → assert `skill-used` + an
     `llm-rubric` on the correct first-turn behavior.
   - A boundary/negative prompt that should **not** activate it (e.g. belongs to
     a sibling skill like api-design vs api-publish) → assert `not-skill-used`.

2. **Core task quality** (`tests/task-quality.yaml`)
   - A representative request that exercises the skill's main workflow.
   - **Deterministic assertions first** (`contains`, `regex`, `is-json`,
     `javascript`) — fast, free, reliable. promptfoo ships a large prebuilt set;
     see the [deterministic metrics reference](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/).
   - **`llm-rubric`(s)** for the holistic judgment — only for what can't be
     checked deterministically. Often one rubric is enough (bundle the must-haves
     into a single "PASS only if A and B and C…" verdict). Use **several** when
     the criteria are independent and you want per-dimension scores or weights —
     give each its own `metric:` (e.g. correctness vs. tone) and/or `weight:`.
     Each rubric is a separate model call, so add them deliberately. See
     [model-graded metrics](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/)
     and the [assertions overview](https://www.promptfoo.dev/docs/configuration/expected-outputs/).

The grader is a single provider (Claude by default, or `--grader codex`) so
scores stay comparable across the providers-under-test.
`skill-used` is asserted **per test**, not globally, so negative cases can use
`not-skill-used`.

## Running

From a skill's `evals/` directory:

```bash
npm install     # installs the agent SDK(s) declared in package.json
npx promptfoo@latest eval -c promptfooconfig.yaml -o output.json --no-cache --no-share
npx promptfoo@latest view
```

- **Node** `>= 22.22` is required by promptfoo.
- **Auth:** the agent-SDK providers reuse your interactive login — run `claude`
  (Claude) or `codex` (Codex) once — or set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.
- **Validate first / after upgrades:** every config pins
  `$schema=https://promptfoo.dev/config-schema.json`, so config-format changes in
  a new promptfoo release surface as validation errors, not silent drift. Run
  `npx promptfoo@latest validate config -c promptfooconfig.yaml` before a run and
  after bumping promptfoo; fix any reported field changes in the config (and, if
  it's a convention-wide change, in `tools/scaffold-eval.js`).
- **Tracing:** enabled in the config (built-in OTel receiver, no external
  collector). View per result via the 🔎 icon → Trace Timeline. Note the tool/skill
  call list lives in each result's **Metadata** (`toolCalls` / `skillCalls` /
  `permissionDenials`), not in the spans — spans are turn-level only.

## Fixtures are copies, not symlinks

The fixture skill is a **real copy** of the skill, not a symlink: Codex's skill
scanner needs real files under `.agents/skills/`, and copies keep the eval
independent of the live skill. The trade-off is drift — after editing the skill,
refresh the copies from the repo root:

```bash
node tools/sync-fixtures.js <plugin> <skill>   # one skill
node tools/sync-fixtures.js --all              # every skill that has evals/
```

## Gotchas worth knowing

- **Allow the `Skill` tool.** If `Skill` isn't in the Claude provider's
  `append_allowed_tools`, the agent's skill call is denied and `skill-used` fails
  even though the skill exists.
- **Codex `skill-used` is heuristic.** Codex has no first-class skill event;
  promptfoo infers usage from shell commands that read `SKILL.md` at the
  `.agents/skills/` path. Treat a single Codex `skill-used` failure as soft.
- **Cost.** Agent-SDK evals are multi-turn and graded — each run bills the API.
  Run them on changed skills, not on every save.

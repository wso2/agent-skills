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
      .claude/skills/<skill>/   # Claude discovery path (generated, gitignored)
      .agents/skills/<skill>/   # Codex discovery path (generated, gitignored)
      <sample projects, stubs>  # committed
    package.json             # `npm run eval` syncs the skill copies, then runs promptfoo
    .gitignore
    README.md
```

Two repo-level tools (under `tools/`) operate on these suites:
`scaffold-eval.js` creates one, and `sync-fixtures.js` copies the live skill into
the fixture workspace before each run.

## Prerequisites (once per machine)

- **Node `>= 22.22`** — promptfoo's minimum runtime.
- **promptfoo** — you don't need to install it; the commands here run it via
  `npx promptfoo@latest`, which fetches it on demand. If you prefer, you can
  install it globally (`npm install -g promptfoo`) and call `promptfoo` directly.
  Either way, pin a version for reproducible runs (`@<version>` or a specific
  global version). Note: a suite's own `npm install` only pulls the agent SDK(s)
  the providers need — not promptfoo.
- **Auth** — run `claude` (Claude) and/or `codex` (Codex) once; the agent-SDK
  providers reuse that interactive login, so local runs need no API key. Set
  `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` only where no login exists, such as CI.

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

## Asserting on what the agent did, not what it said

The Claude Agent SDK provider returns every tool call the agent made — name,
input, output — as `metadata.toolCalls` on the result (also saved in
`output.json`). For a skill that runs a CLI or edits files, that list is the
evidence, and the agent's closing message is only its own account of it. Two
patterns follow:

- **Deterministic checks read the tool calls.** A `javascript` assertion pointed
  at a `file://` module receives `context.metadata.toolCalls`, so it can assert
  that the login check ran before any create command, that the ID the CLI printed
  is the one written into the app, or that no command carried a secret. Keep the
  checks in one module per suite and pick them per test through `vars`
  (e.g. `checks: [statusFirst, appCreated]` with parameters in `expect: {…}`),
  so every test shares one set of rules instead of restating them.
- **Show the rubric grader the trace.** `llm-rubric` sees only the final reply.
  A `defaultTest.options.transform: file://assert/trace.js` that appends the
  commands run and files written to the reply lets one rubric judge tool-level
  behaviour it would otherwise fail for "not being mentioned". Have the
  deterministic module cut the output at the trace marker so the trace never
  trips a leak check.

Reserve rubrics for judgement — does the code follow the quickstart, is the
explanation right — and move anything checkable into JavaScript. A rubric that
fails because the reply "never mentions" a step the agent actually ran is a
grader problem, not a skill problem; the trace fixes it.

When a skill talks to a real service, stub it for the default suite: a fake
CLI on the fixture's PATH that prints what the real one prints (copy output
strings and `--help` text from the real tool, and reject flags it does not
define) proves the skill's process with no credentials and no side effects. A
live run against a sandbox account is a separate, scheduled tier that proves the
tool still accepts those commands.

## Running

From a skill's `evals/` directory:

```bash
npm install     # installs the agent SDK(s) declared in package.json
npm run eval    # copies the live skill into the fixtures, then runs promptfoo
npm run view
```

Pass extra promptfoo flags after `--`, e.g. `npm run eval -- --filter-pattern "T1"`.
Run promptfoo directly only after `npm run sync`; on a fresh clone the fixture
workspace has no skill until then.

- **Node** `>= 22.22` is required by promptfoo.
- **Auth:** the agent-SDK providers reuse your interactive login — run `claude`
  (Claude) or `codex` (Codex) once. No API key is needed locally; set
  `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` only where no login exists, such as CI.
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

## Skill copies are generated, never committed

Everything under a skill's directory, `evals/` included, is installed with the
skill: `npx skills add` and Codex copy the whole folder. A committed fixture copy
would ship a second `SKILL.md` to every user. So:

- **Do not commit** `fixtures/workspace/.claude/skills/<skill>/` or
  `fixtures/workspace/.agents/skills/<skill>/`. The suite's `.gitignore` excludes
  them.
- **`npm run eval` copies the live skill in** before every run (`npm run sync`
  does only the copy). The copy always matches the skill, so there is nothing to
  keep in step.
- **Commit what the tests need around the skill:** sample projects and stubs.

The copies are real files, not symlinks, because Codex's skill scanner needs
real files under `.agents/skills/`. `sync-fixtures.js` picks the layouts from
the providers in the suite's `promptfooconfig*.yaml`:

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
- **The scaffold allows only `Read`, `Grep`, `Glob`.** A skill that runs a CLI,
  edits the fixture project or reads docs needs `Bash`, `Write`, `Edit` or
  `WebFetch` added to `append_allowed_tools`, or every such call is denied and
  the agent improvises. `AskUserQuestion` is not available headless: put the
  answers the skill would ask for, and the plan approval, in the prompt.
- **Runs that edit fixtures need a reset.** Commit the fixture projects, then
  restore them after a run with `git checkout -- <evals>/fixtures/workspace/<apps>`
  plus `git clean -fd` on that path (a `reset` script in the suite's
  `package.json` is the convention). Until the fixtures are committed there is
  nothing to restore from.
- **`--filter-pattern "<description substring>"` re-runs a subset** and `-j 1`
  makes a stubbed CLI's shared state file safe; `-j 2` is a good default.
- **Cost.** Agent-SDK evals are multi-turn and graded — each run bills the API.
  Run them on changed skills, not on every save.

## Evaluating an MCP server

An MCP server's own repo can hold a suite that runs an agent against the real
server, limited to that server's tools.
[`tools/eval-kit`](./tools/eval-kit/README.md) (`@wso2/eval-kit`) is the shared
glue: OAuth sign-in to one or more servers, a runner with telemetry, sharing,
`.env` loading and retries off, a PASS/FAIL/UNKNOWN judge, labelled run history,
comparison against a pinned baseline, `tools/list` snapshots and a cost cap. The
suite keeps only what is specific to the server:

```text
<repo>/<path>/mcp-evals/
  package.json          # @wso2/eval-kit from its release tarball, promptfoo and the agent SDK pinned
  suite.json            # servers (name, env prefix, OAuth client, callback port, url) and run settings
  suite.local.json      # optional local overrides, git-ignored
  promptfooconfig.yaml  # the agent provider, limited to mcp__<server>__*
  tests/<case>.yaml
```

- `npm run eval` signs in (browser the first time, then the cached or refreshed
  token), runs each case 3 times, passes a case at 2 of 3 (or `"pass": "all"`)
  and compares with the baseline. `--label`, `--note` and `--budget` are kit
  flags; a suite's own `flags` become `EVAL_*` variables for its provider.
- `npm run pin -- <label|latest>` makes a good run the baseline; after a change
  to the server, `eval-kit tools --diff` shows the changed tool fields and
  `npm run compare` gives a per-case verdict. Runs live in
  `results/<evalId>/` with a `meta.json` (servers, tool hashes, partial,
  tainted and errored flags, budget, git state).
- Grade with `lib/judge.js:verdict` against the tool results or the provider's
  `metadata.truth`, not data typed into the rubric, so cases survive data
  changes; UNKNOWN shows as `2/3 1?` and never counts as a pass.
- Exit codes: 0 ok, 1 failing or WORSE, 2 usage, 3 preflight, 4 errored,
  partial or tainted.
- Install the kit from a release (`eval-kit-v<version>`) so the lockfile pins
  its hash.

`eval-kit compare`, `pin` and the cost cap (`lib/capped.js`) work for skill suites
too: without a `suite.json`, `eval-kit eval` skips the sign-in.

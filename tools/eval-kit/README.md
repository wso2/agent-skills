# eval-kit

Shared glue for [promptfoo](https://www.promptfoo.dev) agent evals: MCP sign-in to one or more servers, a runner with safe defaults, an UNKNOWN-aware judge, run history with labels, comparison against a pinned baseline, `tools/list` snapshots and a cost cap. A suite keeps only what is specific to it.

## Suite layout

```text
<suite>/
  package.json          # @wso2/eval-kit, promptfoo and the agent SDK, exact versions
  suite.json            # MCP servers and run settings (omit for a skill suite)
  suite.local.json      # optional local overrides, git-ignored
  promptfooconfig.yaml
  tests/*.yaml
  .gitignore            # .state/ .promptfoo/ results/ suite.local.json node_modules/
```

The kit takes the suite from the current directory and keeps its data there: `.state/` (tokens), `.promptfoo/` (promptfoo's database) and `results/`.

## suite.json

```json
{
  "servers": [
    { "name": "agent-platform", "env": "AMP_MCP", "clientId": "am-mcp", "callbackPort": 33418, "url": "https://.../mcp" }
  ],
  "conditions": ["@my/source"],
  "flags": { "overlay": { "env": "EVAL_OVERLAY" }, "allow-writes": { "env": "EVAL_ALLOW_WRITES", "value": "1" } },
  "pass": "2of3",
  "budgetUsd": 2,
  "gitScope": ".."
}
```

| field | meaning |
| --- | --- |
| `servers[].name` | `[a-z0-9-]+`; also names `tools/<name>.json` |
| `servers[].env` | optional `[A-Z][A-Z0-9_]*`; a run sets `<env>_URL` and `<env>_TOKEN` for promptfoo. Without it no token enters promptfoo's environment |
| `servers[].clientId`, `callbackPort` | public OAuth client (PKCE) and its loopback port `http://127.0.0.1:<port>/callback` |
| `servers[].url`, `authFrom` | MCP server, and the MCP whose OAuth metadata the sign-in follows if not `url` |
| `servers[].authServer` | optional issuer URL of the expected authorization server. `eval-kit login`, `doctor`, `eval` and `tools` refuse a sign-in from another server and do not reuse a token that it did not issue |
| `conditions` | `--conditions=<c>` for promptfoo's node process (TypeScript providers loaded by tsx) |
| `flags` | `eval-kit eval --<name> [value]` sets `env` (`EVAL_*`) for promptfoo; the value defaults to `value`, else `1` |
| `pass` | a case passes at `2of3` runs (default) or `all` |
| `budgetUsd` | per-run cost cap; `--budget` and `EVAL_BUDGET_USD` override it; default 2 |
| `gitScope` | path whose git head and dirty state go into `meta.json` |
| `stateDir` | token folder relative to the suite: inside `gitScope` when set, else inside the suite folder; default `.state` |

Names, ports and env prefixes must be unique, and every URL must be https, or http on a local host. Other keys are kept for the suite's own code. `suite.local.json` is merged key by key; its `servers` merge by name. The legacy single-server form (`server`, `env`, `clientId`, `callbackPort`, `url`, `authFrom`, `authServer` at the top level) still works. In a suite with exactly one server, `MCP_URL` and `MCP_AUTH_FROM` override its `url` and `authFrom`; with more servers they are refused, so set URLs in `suite.local.json`.

## Install

Install the release tarball, which `npm install` records in the lockfile with its `integrity` hash:

```json
"scripts": { "eval": "eval-kit eval", "compare": "eval-kit compare", "login": "eval-kit login" },
"dependencies": {
  "@wso2/eval-kit": "https://github.com/wso2/agent-skills/releases/download/eval-kit-v<version>/wso2-eval-kit-<version>.tgz",
  "@anthropic-ai/claude-agent-sdk": "0.3.283",
  "promptfoo": "0.124.1"
}
```

The kit has no dependencies. A suite that runs evals lists promptfoo 0.124.1 as a direct dependency, and the Agent SDK too if it uses the Claude Agent SDK provider. `capped.js` and `judge.js` load promptfoo from the suite, not from the kit. A package that needs only `@wso2/eval-kit/login` installs the kit alone.

## promptfooconfig.yaml

Wrap each provider in the cost cap and pass a token only by reference:

```yaml
providers:
  - id: file://node_modules/@wso2/eval-kit/lib/capped.js
    config:
      target: anthropic:claude-agent-sdk
      mcp:
        servers:
          - name: <server>
            url: '{{ env.<env>_URL }}'
            headers:
              Authorization: 'Bearer ${<env>_TOKEN}'
defaultTest:
  options:
    provider:
      id: file://node_modules/@wso2/eval-kit/lib/capped.js
      config: { target: anthropic:claude-agent-sdk, judge: true, model: claude-opus-5-5, tools: [] }
```

- `lib/judge.js:verdict` is a `javascript` assertion that answers PASS, FAIL or UNKNOWN, with `config: { rubric, evidence: 'truth' | 'toolResults', subject, timeoutS }`. `truth` reads `metadata.truth` from the provider; `toolResults` (default) reads the MCP tool calls. It asks the test's judge provider with a JSON-schema `output_format`, and returns `metadata: { verdict, judgeCostUsd, judgeModel }`. A provider error, a timeout, no verdict or evidence over 200,000 characters makes the row an ERROR, never a verdict. Use it instead of `llm-rubric`, which cannot say UNKNOWN.
- promptfoo resolves `file://module.js:name` as `(module.default ?? module).name`, so it cannot load a named export from a module that also has a default export. Keep assertion and test functions referenced by name in a module without a default export, as `lib/judge.js` is.
- `lib/asserts.js` has `calledAnyOf` and `replyWithToolResults` for `llm-rubric` suites.
- `lib/budget.js` holds the run's spend (`spent()`, `limit()`, `exhausted()`, `add()`); `lib/capped.js` uses it.
- Code that runs inside promptfoo can sign in itself: `getToken(server, { browser: false, stateDir })` from `@wso2/eval-kit/login` returns `{ token, expiresAt }` from the cache, refreshing when needed, or throws "run eval-kit login". With `authServer: '<issuer URL>'`, sign-in refuses when the MCP's resource metadata names a different authorization server, and a cached token is reused only if it came from that server. Without the option, `getToken` uses `server.authServer`, so a server from `loadSuite` keeps the check from `suite.json`. `loadSuite(dir)` is in `@wso2/eval-kit/suite`; `compareRuns(a, b, { resultsDir })` and `resolveRef` are in `@wso2/eval-kit/compare`.

## Commands

- `eval-kit eval` (or `run`) `[--label L] [--note N] [--budget USD] [--no-compare] [--<suite flag> [v]] [promptfoo flags]`: signs in to every server, snapshots their tools, runs every case 3 times (`--repeat` overrides), prints each case, then compares with the baseline. `--filter-failing <ref>` takes a label, `latest` or an eval id.
- `eval-kit list`, `eval-kit show [ref] [case] [--full]`: runs, and one run's rows, redacted.
- `eval-kit compare [A] [B] [--json]`: by default the baseline, else the previous run, against the latest.
- `eval-kit pin <ref>`: makes that run the baseline.
- `eval-kit tools [--server N] [--diff [ref]]`: the current `tools/list`, or the fields changed since a run.
- `eval-kit login [--server N] [--force] [--no-browser] [--logout [--all]]`.
- `eval-kit doctor`: node, promptfoo and SDK versions, git-ignores, each server's sign-in and `tools/list`.
- `eval-kit view`: promptfoo's viewer on 127.0.0.1. `eval-kit promptfoo <args>`: any other promptfoo command, same environment.

A ref is an eval id, a label (the latest run with it), `latest` or `baseline`. A label starts with a letter, has at most 64 letters, digits, `.`, `_` and `-`, and cannot be `latest`, `baseline`, `previous` (any case) or look like an eval id.

## Results

`results/<evalId>/` holds `eval.json` (promptfoo's export), `meta.json`, `tools/<server>.json` (and `<server>.after.json` if the tools changed during the run) and whatever the provider writes under `EVAL_KIT_RUN_DIR`: the run writes into `results/.run-<pid>/` and renames it at the end. A provider that serves altered tools writes them to `served/<server>.json` (an array of tools); compare marks changes there that upstream does not have as `(overlay)`.

`meta.json`: `kit`, `evalId`, `label`, `note`, `startedAt`, `endedAt`, `servers.<name>.{url, authFrom?, origin, tools.{before, after}}` (tool hashes), `flags.{partial, tainted, errored}`, `budget.{limit, spent, refused}`, `git.{head, dirty}`, `suiteFlags`, `pass`, `args`. No tokens.

- partial: the budget stopped calls; tainted: a server's tools changed during the run or could not be listed after it; errored: a row ended in an error.

`compare` says BETTER, WORSE, NO CHANGE, INCONCLUSIVE or NOT COMPARABLE:

- A case moves when its pass rate changes by at least half its runs, rounded up; a smaller change shows `~`. An UNKNOWN run counts in n, not k: `2/3 1?`.
- Errors (`k/n+Ee`) in cases both runs have make it INCONCLUSIVE.
- A different agent or judge model, case content, run count or server URL makes it NOT COMPARABLE.
- Turns are flagged `!` at a median change of 2, agent cost per run at 25%, unless the prompt-cache hit rate moved over 20 points, which shows `(cache)`.
- A case's tool paths collapse repeated calls (`list_projects > list_integrations x7`).
- It also reports tool changes per server, tainted and partial runs, calls per tool per run and the total agent cost change.

## Exit codes

0 ok; 1 failing cases or WORSE; 2 usage; 3 preflight (sign-in, `tools/list`, doctor); 4 errored, partial or tainted, or promptfoo stopped by a signal.

## Safety

- Everything the kit writes is owner-only (umask 077). `.promptfoo/` and `results/` hold prompts, replies and tool data; keep them out of git.
- `.state/` holds OAuth tokens, written atomically under a per-file lock. A server with `env` gets its token into promptfoo only as `<env>_TOKEN`, used literally as `Bearer ${<env>_TOKEN}`, so promptfoo never stores it; on macOS `ps eww` shows a process's environment to the same user. A server without `env` keeps its token out of promptfoo's environment.
- promptfoo gets only an allow-listed environment (no `ANTHROPIC_API_KEY`, no `NODE_OPTIONS`), `DOTENV_PATH=/dev/null` so no `.env` is read, and telemetry, update checks, sharing, remote generation, log files and its cache off.
- No retries: `PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER=1` and `capped.js` handles its own, so a rate-limited or `429` call is an ERROR row, not a duplicate run.
- The viewer binds to 127.0.0.1 and refuses requests whose `Host` or `Origin` is not local.
- MCP, IdP and token URLs, including stored ones, must be https or http on a local host. Token requests never follow redirects.
- `authServer` must equal the first `authorization_servers` entry of the resource metadata. Both are compared as parsed URLs (scheme and host case, default port) with one trailing slash ignored; the path must match exactly.
- The `authServer` check pins the authorization server URL that the resource metadata names. eval-kit does not compare the metadata `issuer` (RFC 8414, section 3.3), because ThunderID publishes an issuer that is not a URL.
- `capped.js` and `judge.js` load only `<suite>/node_modules/promptfoo`, never a copy in a parent folder. The suite is `EVAL_KIT_SUITE_DIR`, which the kit sets for promptfoo, else the current folder. The entry file must be inside the package folder after links are resolved.
- Budget: no new agent call starts once the run has spent its limit; calls already running may take it over. Judge calls are counted but never refused.

## Developing

`npm ci --ignore-scripts && node --test` runs the offline tests, including an end-to-end run of the pinned promptfoo with fake providers and a local MCP fixture.

## Releasing

Bump `version` in `package.json` and push a tag `eval-kit-v<version>`. The `eval-kit` workflow runs the tests, packs the kit and attaches the `.tgz` to that tag's GitHub release. Never move a tag.

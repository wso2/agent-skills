# eval-kit

Shared glue for [promptfoo](https://www.promptfoo.dev) agent evals: MCP sign-in, a runner with safe defaults, run comparison against a pinned baseline, a `tools/list` diff, a per-run cost cap and a viewer bound to 127.0.0.1. A suite keeps only what is specific to it: `suite.json`, `promptfooconfig.yaml` and `tests/`.

## Suite layout

```text
<suite>/
  package.json          # depends on @wso2/eval-kit, promptfoo and the agent SDK, exact versions
  suite.json            # the MCP server under test (omit for a skill suite)
  promptfooconfig.yaml
  tests/*.yaml
  .gitignore            # .state/ .promptfoo/ results/ node_modules/
```

The kit takes the suite from the current directory and keeps its data there: `.state/` (tokens), `.promptfoo/` (promptfoo's database) and `results/` (exports, tool snapshots, the baseline).

`suite.json`:

| field | meaning |
| --- | --- |
| `server` | MCP server name used in the config (`mcp__<server>__*`) |
| `env` | prefix of the variables a run sets: `<env>_URL` and `<env>_TOKEN` |
| `clientId` | OAuth client the sign-in uses (public client, PKCE) |
| `callbackPort` | loopback port registered as `http://127.0.0.1:<port>/callback` |
| `url` | MCP server under test; `MCP_URL` overrides it |
| `authFrom` | MCP whose OAuth metadata the sign-in follows, if not `url`; `MCP_AUTH_FROM` overrides it |

## Install

Install the release tarball, which `npm install` records in the lockfile with its `integrity` hash:

```json
"scripts": {
  "eval": "eval-kit eval", "view": "eval-kit view", "compare": "eval-kit compare", "pin": "eval-kit pin",
  "tools": "eval-kit tools", "login": "eval-kit login", "promptfoo": "eval-kit promptfoo", "test": "eval-kit test"
},
"dependencies": {
  "@wso2/eval-kit": "https://github.com/wso2/agent-skills/releases/download/eval-kit-v0.1.0/wso2-eval-kit-0.1.0.tgz",
  "@anthropic-ai/claude-agent-sdk": "0.3.283",
  "promptfoo": "0.124.1"
}
```

In `promptfooconfig.yaml`, wrap each provider in the cost cap and pass the token by reference:

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
```

`lib/asserts.js` has `calledAnyOf` (a `javascript` assertion with `config: { tools: [...] }`) and `replyWithToolResults` (a transform that gives an `llm-rubric` the reply and the MCP tool results).

## How to use

- `eval-kit eval [promptfoo flags]`: signs in, snapshots `tools/list`, runs every case 3 times and prints each case's pass count. A case passes when 2 of its 3 runs pass. Without `suite.json` it skips the sign-in and the snapshot.
- `eval-kit view`: promptfoo's viewer on 127.0.0.1.
- `eval-kit pin <eval id|latest>`: makes that run the baseline.
- `eval-kit compare [A] [B]`: per-case verdict, by default the baseline against the latest run.
- `eval-kit tools [--diff [eval id]]`: the current `tools/list`, or the fields changed since the baseline.
- `eval-kit login [--force|--logout|--no-browser]`: signs in without running.
- `eval-kit promptfoo <args>`: any other promptfoo command with the same environment.
- `eval-kit test`: the kit's own offline tests.

`compare` says BETTER, WORSE, NO CHANGE, INCONCLUSIVE or NOT COMPARABLE, and exits 1 only for WORSE.

- A case moves only when its pass count changes by at least half its runs, rounded up. A smaller change shows as `~`.
- Errored runs show as `k/n+Ee` and make the verdict INCONCLUSIVE.
- A different agent model, judge model, or prompt or assertions of a case make it NOT COMPARABLE.
- Turns are flagged `!` at a median change of 2 or more, agent cost per run at 25% or more.

## Safety

- Everything the kit writes is owner-only (umask 077). `.promptfoo/` and `results/` hold prompts, replies and tool inputs and outputs; keep them out of git.
- `.state/` holds OAuth tokens, written atomically. The token reaches the agent only as `<env>_TOKEN`, used literally as `Bearer ${<env>_TOKEN}`, so promptfoo never stores it. On macOS, `ps eww` shows a process's environment to the same user.
- promptfoo runs with `PROMPTFOO_CONFIG_DIR` in the suite and with telemetry, update checks, sharing, remote generation and its log files off. It passes its environment to the agent, so it gets only the variables a run needs; `ANTHROPIC_API_KEY` is not one of them.
- promptfoo's viewer has no auth; the kit binds every server it starts to 127.0.0.1.
- MCP, IdP and token URLs must be https, or http on a local host. Token requests never follow redirects.
- Each run stops at `EVAL_BUDGET_USD` (default 2) of agent and judge cost. A judge call stopped by it shows as an error, not a failure.

## Releasing

Bump `version` in `package.json` and push a tag `eval-kit-v<version>`. The `eval-kit` workflow runs the tests, packs the kit and attaches the `.tgz` to that tag's GitHub release.

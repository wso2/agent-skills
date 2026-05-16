# amctl sharp edges

Non-obvious failure modes the CLI surfaces poorly or not at all. Read this when an `amctl` call produces a surprising error, an empty envelope, or a "looks fine but isn't" success.

| Symptom / mistake | Why | Fix |
|-------------------|-----|-----|
| `INVALID_FLAG: --project ...` | Most agent/build commands are project-scoped. | Pass `--project <name>`. |
| `NO_ENVIRONMENT: no environment ...` | Runtime cmds need an env. | Pass `--env default`. |
| `agent build logs <UUID>` returns nothing | Builds are addressed by `buildName`, not `buildId`. | Use `.data.builds[].buildName` from `build list --json`. |
| `agent get` shows `status: ""` even when broken | The status field isn't a liveness indicator. | Use `agent logs --since 5m --level ERROR` and `agent metrics`. |
| `agent traces` returns empty `data.traces` | Agent never ran, time window too small, or auto-instrumentation off. | Widen `--since`, check `agent logs` for boot errors, confirm `--no-auto-instrumentation` wasn't set at create. |
| `traces` `count` vs `totalCount` mismatch | Filtered response uses `count`, unfiltered uses `totalCount`. | `jq '.data.count // .data.totalCount'`. |
| Trace list field `durationInNanos`, trace detail field `durationNs` | Field naming differs across endpoints. | Read both names when normalizing. |
| `agent deploy` env vars stored as plain text | CLI does not encrypt at deploy. | Use `--env-secret` at create, or set real secrets via UI. |
| Deploy prompts for env-conflict confirmation | Merging `--env` with current config when values differ. | Pass `-y` to accept, or use distinct keys. |
| Created agent with wrong build type / repo path | `agent create` has no `update` equivalent for those fields. | Delete and recreate, or edit via UI. Run `amctl agent update --help` to confirm what *can* be updated. |
| External agent has no logs/metrics | External provisioning means agent-manager doesn't run the workload. | Only `traces` works for external agents. |
| `amctl context show --json` looks logged in but `project list` returns `NO_ORG` | `context show` only reflects the instance URL, not auth state. | Treat `amctl project list --json` as the login canary, never `context show` alone. |
| `agent get --json` shows no env fields even though the deployed pod clearly has env vars set | `agent get` does not surface deployment env at all — env set via UI, project-level secrets, or platform injection is invisible to the CLI. | Never use `agent get` to confirm "is variable X set". Inspect pod behavior via `agent logs` — a pydantic/Settings validation error usually dumps `input_value` and reveals what *is* present. Set/unset confirmation requires the UI. |
| Crash-loop signature: many `cpuUsage` samples, **zero** `memoryUsage` samples | Pod alive at startup (CPU-scraped), dies before memory-scrape interval. | Combine with `agent logs --level ERROR --since 4h` — repeating stack trace at ~3 min intervals (kube restart-backoff) confirms crash loop. |
| Build `Completed`, but only ~7 lines of `otel-tracing instrumentation` init-container output; `cpu:0 mem:0`; `traces count:0` | CLI has no `pod describe`/events/readiness. `ImagePullBackoff`, `CrashLoopBackoff` with empty stdout, or slow image pull all look identical to "freshly deployed". | Don't claim "the agent came up" from absence-of-errors. Positive evidence required: ≥1 `memoryUsage` sample, or ≥1 app-level log line past the init container. After ~3 min with neither, escalate to cluster tools (`kubectl describe pod`, `kubectl get events`). |
| `agent delete -y --json` returns `data.deleted: true` but `agent list` still shows the agent | Delete is async; list reads slightly stale cache. | Poll `agent list` until the name is gone. Usually clears in 5–15s. |
| `jq` errors with `syntax error, unexpected //` inside an object literal | `//` (alternative) needs parens inside object construction. | Wrap in parens: `jq '.data \| {x: (.a // .b)}'`. |
| `zsh: read-only variable: status` inside a build-poll loop | zsh aliases `$status` to `$?`. | Rename the variable — `st`, `build_status`, anything else. |

---
name: manage-agent
description: Use when an agent needs to drive the full agent-manager lifecycle through `amctl` — install the CLI, log in, create/deploy an agent, list projects and agents, watch build progress, fetch build/runtime logs and metrics, and pull traces. Dulls the sharp edges of the CLI (mandatory flags, mixed identifiers, silent statuses) so the workflow is reliable end-to-end.
---

# manage-agent

Drive `amctl` to manage agent-manager resources end-to-end. Locks the non-obvious patterns of the CLI into a predictable shape so calls don't silently fail or return half-empty envelopes.

**Flag shape is owned by `amctl <verb> --help`, not this skill.** Skills can't stay in lockstep with CLI versions; `--help` always reflects the installed binary. This document carries the things `--help` *won't* tell you: when to call which verb, what its output really means, and where the CLI's surface is misleading.

## Reference files

- **`references/troubleshooting.md`** — symptom → cause → fix table for non-obvious CLI behavior (empty envelopes, misleading statuses, async deletes, crash-loop signatures, shell traps). Load when an `amctl` call surprises you.
- **`references/triage.md`** — diagnostic flow for "build is Completed but the agent isn't really running" (build → logs → metrics → traces). Load when verifying a fresh deploy or chasing a runtime-only failure.

## Install

If `command -v amctl` returns a path, skip.

```bash
curl -fsSL https://raw.githubusercontent.com/wso2/agent-manager/main/scripts/install-amctl.sh | sh
```

After the installer finishes, **stop and tell the user**: open a new terminal so the updated `PATH` is picked up, then run:

```bash
amctl login --url <instance-url>
```

`amctl login` is an interactive browser-redirect flow. **Always defer to the user's terminal — never attempt login from this session, even against localhost.**

Once the user confirms login, verify with `amctl project list --json` — NOT `amctl context show`. `context show` only reflects the instance URL and looks identical for an unauthed half-configured context as for a logged-in one. The real auth canary is any project-scoped call: failure surfaces as `error.code: NO_ORG`.

## Iron rules

1. **Always pass `--json`.** Errors come back as a structured envelope (`error.code`, `error.message`, `error.additionalData.details`). Success envelopes always carry `data` plus context (`instance`, `org`, `project`, sometimes `environment`, `agent`). Exception: `agent build logs` is raw text.
2. **Run `amctl <verb> --help` before every call you haven't made this session, and always before `create` / `update`.** Flag sets evolve. Never infer flag absence from this doc, prior conversation, or a sibling agent's example.
3. **Always pass `--project <name>` explicitly** on project-scoped commands. Be aware `amctl context link` exists and a user may have linked a directory (check `amctl context show`), but do not link/unlink yourself — keep every command self-describing.
4. **Runtime commands (`logs`, `metrics`, `traces`, `trace`, `traces export`) require `--env <name>`.** Use `--env default` for local dev.
5. **Builds are identified by `buildName`** (e.g. `hotel-booking-agent-1778760196718`), NOT `buildId` (UUID). Build commands take the agent name as a *positional* arg, not `--agent`.
6. **`amctl agent get` does not show deployment health.** Its `status` field is usually empty. Verify liveness with `agent logs` or `agent metrics`. See `references/triage.md`.
7. **Validation errors come batched** in `error.additionalData.details`. Read the full list, fix everything, retry — don't fix one at a time.

## Verb map

What exists, what it's for, and where `--help` lives. For exact flags on any row, run `amctl <verb> --help`.

| Verb | Use to | Notes |
|------|--------|-------|
| `amctl context show` | Inspect current instance / org / linked project. | Auth-blind: shows URL even when unauthed. Not a login check. |
| `amctl context link` / `unlink` | (User concern, not yours.) Bind a directory to a project / agent. | Be aware of it; don't run it yourself. |
| `amctl project list` / `get` | Discover projects, confirm auth works. | `project list` is the login canary. |
| `amctl project create` / `delete` | Manage projects. | `delete` needs `-y`. |
| `amctl agent list` / `get` | Discover agents, read agent config. | `get` does NOT show liveness or deployment env — see iron rule 6. |
| `amctl agent create` | Create + auto-build + auto-deploy in one call. | Required flags vary by `--subtype` (`chat-api` / `custom-api`) and `--build-type` (`buildpack` / `docker`) and `--provisioning` (default / `external`). Always `--help` first. |
| `amctl agent deploy` | Re-deploy a built image, optionally with new env. | `-y` to accept env-conflict prompt. |
| `amctl agent delete` | Remove an agent. | Async — `agent list` may still show it for 5–15s after `data.deleted: true`. |
| `amctl agent build list` | Enumerate builds, newest first. | Entries carry both `buildId` (UUID) and `buildName`. Use `buildName` everywhere downstream. |
| `amctl agent build get` | Status / percent / step list for one build. | `data.status` ∈ `Pending` / `Running` / `Completed` / `Failed`. Agent name is positional. |
| `amctl agent build create` | Trigger a fresh build without recreating the agent. | Optional commit pin. |
| `amctl agent build logs` | Raw text build log (image pull, buildpack, workload CR apply). | NOT JSON. May be empty for 10–30s after a fresh build — retry. |
| `amctl agent logs` | Runtime pod logs. | Requires `--env`. Filter with `--since` / `--level` / `--grep` / `--sort` — run `--help` for current set. |
| `amctl agent metrics` | CPU / memory time-series for the running pod. | Requires `--env`. Returns `data.{cpuLimits,cpuUsage,memoryLimits,memoryUsage}`, each an array of `{time, value}`. |
| `amctl agent traces` | List OTel traces from the agent's spans. | Requires `--env`. `--condition` narrows to built-in heuristics (errors, latency, token usage, tool failures, span count) — run `--help` for the current names and thresholds. Filtered response uses `data.count`; unfiltered uses `data.totalCount`. |
| `amctl agent trace` | Span detail for a single `traceId`. | Add `--span <spanId>` for one span's full attrs / events. Note: trace detail uses `durationNs`, trace list uses `durationInNanos`. |
| `amctl agent traces export` | Bulk dump full span data for every trace in a window. | `--since` is required. |

## End-to-end recipe

The flow for "create an agent and confirm it's actually serving traffic." For exact flags at each step, run `amctl <verb> --help` against your installed binary.

1. **Create.** Run `amctl agent create --help` to see the current required flag set for your `--subtype` / `--build-type` / `--provisioning` combination, then call `amctl agent create <name> --project <p> ... --json`. The create call auto-builds and auto-deploys to the lowest environment (`default` locally).
2. **Poll the build.** `amctl agent build list <agent> --project <p> --json` returns newest-first; pull `data.builds[0].buildName`. Poll `amctl agent build get <agent> <buildName> --project <p> --json` until `data.status` is `Completed` or `Failed`. In zsh, name the loop variable anything except `status` — zsh reserves `$status` as a read-only alias for `$?`.
3. **Confirm liveness.** `agent get` won't tell you. Tail `amctl agent logs <agent> --project <p> --env default --since 5m --json` and look for app-level output past the otel-tracing init container, or check `amctl agent metrics ...` for ≥1 `memoryUsage` sample. If you see neither after ~3 min, run the full diagnostic in `references/triage.md`.
4. **Watch traces once there's traffic.** `amctl agent traces <agent> --project <p> --env default --since 1h --json`. Empty list = agent hasn't run, window too narrow, or auto-instrumentation was disabled at create. Drill into a specific trace with `amctl agent trace <agent> <traceId> ...`.

When anything in this flow returns a surprising envelope, check `references/troubleshooting.md` before reaching for a workaround.

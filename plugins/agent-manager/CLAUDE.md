# agent-manager Plugin — Agent Conventions

## Skills in this Plugin

- [`skills/manage-agent/`](./skills/manage-agent/SKILL.md) — drive the full agent-manager lifecycle through `amctl`

## manage-agent Skill

End-to-end `amctl` workflow:
1. **Install / login** — install the CLI, defer interactive login to the user, verify with `project list --json`
2. **Create / deploy** — `agent create` auto-builds and auto-deploys; always pass `--json` and `--project`
3. **Verify** — poll `agent build get`, confirm liveness with `agent logs` / `agent metrics` (never `agent get`)
4. **Triage** — when something looks wrong, run the build → logs → metrics → traces flow in `references/triage.md`

## Key Reference Files

- `skills/manage-agent/references/triage.md` — diagnostic flow for "build Completed but agent isn't really running"
- `skills/manage-agent/references/troubleshooting.md` — symptom → cause → fix table for non-obvious CLI behavior
- `skills/manage-agent/scripts/install-amctl.sh` — bundled wrapper around the upstream installer

# agent-manager Plugin

Agent skill for the WSO2 agent-manager platform.

## Skills

| Skill | Triggers |
|-------|----------|
| **manage-agent** | Install `amctl`; create, build, deploy, and inspect agents; tail logs, metrics, and traces; triage runtime failures |

## Getting Started

See the [installation instructions](../../README.md#installation) in the main README to install this plugin. Once installed, just describe what you want in plain language — the skill will pick up the request. Below are some prompts to try.

### Installing and logging in

```
> Set up amctl on my machine.
```
```
> I need to log in to the agent-manager — walk me through it.
```

The skill checks for an existing `amctl`, asks before installing, and hands the interactive `amctl login` flow back to you.

### Creating and deploying an agent

```
> Create a new chat-api agent called hotel-booking in project travel.
```
```
> Deploy the latest build of the orders-agent to the default environment.
```

The skill runs `amctl <verb> --help` first to lock onto the current flag set, calls the CLI with `--json`, and polls the build until it lands.

### Inspecting a running agent

```
> Show me the last hour of error logs for the hotel-booking agent.
```
```
> Pull CPU and memory metrics for the orders-agent over the last 30 minutes.
```
```
> List recent traces from the hotel-booking agent and drill into the slowest one.
```

### Triaging a failed deploy

```
> The build says Completed but the agent doesn't seem to be running — what's going on?
```
```
> My agent is in a crash loop. Help me find the cause.
```

The skill follows the build → logs → metrics → traces flow in `references/triage.md` to localise the failure before recommending a fix.

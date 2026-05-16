# Triage: "build is Completed but I don't think the agent is actually running"

Run in this order — each step rules out one class of failure. Pair with `references/troubleshooting.md` for individual symptom→cause mappings.

```bash
AGENT=<agent-name>
PROJ=<project>

# 1. Build history — is the latest build actually Completed?
amctl agent build list "$AGENT" --project "$PROJ" --json \
  | jq '.data.builds[0] | {buildName, status, percent}'

# 2. Runtime logs — what does the pod actually say?
amctl agent logs "$AGENT" --project "$PROJ" --env default \
  --since 24h --level ERROR --limit 50 --sort desc --json \
  | jq -r '.data.logs[]? | "\(.timestamp) \(.log)"' | head -40

# 3. Metrics — alive long enough to be scraped?
amctl agent metrics "$AGENT" --project "$PROJ" --env default --since 1h --json \
  | jq '{cpuSamples:(.data.cpuUsage|length), memSamples:(.data.memoryUsage|length), latestMem:.data.memoryUsage[-1]}'

# 4. Traces — is the pod actually serving requests?
amctl agent traces "$AGENT" --project "$PROJ" --env default --since 24h --limit 5 --json \
  | jq '{count: (.data.count // .data.totalCount)}'
```

## Reading the results

| Pattern | Likely cause |
|---------|--------------|
| Latest build `Failed` | Build is the problem. `agent build logs <agent> <buildName>` for that build. |
| Build `Completed`, app logs show repeating stack trace at ~3 min intervals | Crash loop. Almost always a missing required env var or unreachable downstream (DB / API key / external service). |
| Build `Completed`, only init-container otel-tracing logs visible, `cpuSamples:0 memSamples:0`, 10+ min after build | Pod never reached app layer. CLI can't tell you more. Escalate to cluster (`kubectl describe pod`, `kubectl get events`). |
| `cpuSamples > 0` AND `memSamples == 0` | Crash-loop signature: alive at startup, dead before mem scrape. |
| Build `Completed`, app logs healthy, `memSamples > 0`, `traces count: 0` | Pod up, no traffic, or auto-instrumentation off. Check `--no-auto-instrumentation` wasn't set at create. |
| Build `Completed`, app logs healthy, traces present with `errorCount > 0` | Runtime fine; requests failing. Drill in with `--condition error_status`, then `agent trace <agent> <traceId>` for span detail. |

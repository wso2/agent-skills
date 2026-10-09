# integrator — promptfoo evals

Evaluates the `integrator` skill as a real agent skill discovered from the fixture
workspace. See [EVALS.md](../../../../../EVALS.md) at the repo root for the full guide.

## Run

```bash
npm install                    # installs the agent SDK(s)
# log in once (no API key needed locally):
#   claude        (Claude)   /   codex        (Codex)
npm run eval                   # syncs the fixture skills, then runs promptfooconfig.yaml
npm run eval:no-ballerina      # syncs, then runs promptfooconfig.no-ballerina.yaml
npm run view
```

Requires Node >= 22.22. Pass extra promptfoo flags after `--`, e.g.
`npm run eval -- --filter-pattern "T1"`.

There are two configs. `promptfooconfig.yaml` enables the `integrator` and `ballerina` skills
and runs `tests/triggering.yaml` and `tests/task-quality.yaml`. `promptfooconfig.no-ballerina.yaml`
enables only `integrator`, so the Ballerina skill is genuinely unavailable, and runs
`tests/missing-ballerina.yaml`.

Results vary between runs; add `-- --repeat 3` and treat a test as passing when it passes at
least two of three.

## Fixtures

`npm run sync` (run by both eval scripts) generates the fixture skills; they are gitignored
and never committed, because anything under the skill's directory ships with the skill:

- `fixtures/workspace/.claude/skills/integrator` — a copy of the live skill.
- `fixtures/workspace/.claude/skills/ballerina` — written from `fixtures/stubs/ballerina-skill.md`,
  a stub carrying only the Ballerina skill's description so triggering tests have a competitor.
  Keep its description in step with ballerina-platform/skills.

Committed alongside: `fixtures/stubs/` and the read-only sample projects `fixtures/workspace/projects/multi`
(several integrations) and `projects/single` (one integration) that the layout tests point at.

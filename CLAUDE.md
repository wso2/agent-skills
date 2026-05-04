# WSO2 Agent Skills — Agent Conventions

## Skill Structure

Every skill lives at `plugins/<plugin>/skills/<skill-name>/SKILL.md`. `SKILL.md` opens with YAML frontmatter (at minimum `name` and `description` — the description is the primary trigger signal) followed by:

- **Trigger conditions** — when the agent should activate this skill
- **Workflow** — numbered phases with clear, ordered steps
- **Allowed tools** — which agent tools the skill may use
- **Reference pointers** — which `references/`, `scripts/`, or `assets/` files to read and when

Supporting material is split into `references/`, `scripts/`, and `assets/` siblings of `SKILL.md` so the skill body stays small and references load on demand.

## Contributing a New Skill

1. Create the skill directory under the appropriate plugin: `plugins/<plugin>/skills/<skill-name>/`.
2. Write `SKILL.md`.
3. Add `references/`, `scripts/`, or `assets/` siblings as needed.
4. Verify the skill triggers correctly before submitting (test prompts that should and should not activate it).

# WSO2 Agent Skills — Agent Conventions

## Skill Structure

Every skill must have a `SKILL.md` at `plugins/<plugin>/skills/<skill-name>/SKILL.md`.

SKILL.md should define:
- **Trigger conditions** — when agent activates this skill
- **Workflow** — numbered phases with clear steps
- **Allowed tools** — which agent tools the skill may use
- **Reference files** — point to docs in `references/` where relevant

## Contributing a New Skill

1. Create the skill directory under the appropriate plugin
2. Write `SKILL.md` following the existing skill format
3. Add reference docs, assets, or scripts as needed
4. Verify the skill triggers correctly before submitting

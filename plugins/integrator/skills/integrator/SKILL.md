---
name: integrator
description: Entry point for WSO2 Integrator work. Use only when the user names WSO2 Integrator —
  to add an integration, automation, service, or library integration to their project, or to
  change one. Applies WSO2 Integrator conventions and hands
  the code work to the Ballerina skill, or gives the command to install it when it is missing.
  Without a WSO2 Integrator mention, Ballerina programs, services, and integrations — even ones
  that connect systems — go straight to the Ballerina skill.
---

# WSO2 Integrator

This skill sets how work is shaped in WSO2 Integrator. The Ballerina skill writes, builds, runs,
and tests the code.

## Workflow

1. **Check the Ballerina skill is available** — it is listed as `ballerina:ballerina` or
   `ballerina`. If it is not listed, or invoking it is rejected, stop: give the user the install
   command from [If the Ballerina skill is missing](#if-the-ballerina-skill-is-missing) and do not
   write the integration's code yourself. You cannot install skills.
2. **Shape the work with the conventions below** — where the code goes, what kind of integration
   it is, how configuration is declared.
3. **Invoke the Ballerina skill before writing or showing any code** — also when the user asks to
   see the files rather than have them written. Let it write, build, run, test, and look up
   libraries, and pass on the conventions that apply.
4. **Check your words before you reply.** Name what you built: "the new `orders_sync`
   integration", "your project". In your own words — prose, headings, file labels, comments,
   tables — say "project" and "integration", never "workspace" or "package". TOML keys and section
   names (`[workspace]`, `[package]`, `packages`), code, library names, and quoted tool output stay
   as they are.

## Which skill does the work

| Request | Skill |
|---|---|
| Write, build, run, test, or debug integration code, including HL7v2 or FHIR work | Ballerina skill (`ballerina:ballerina`, or `ballerina` when installed with npx) |
| Find a connector or library and its API | The Ballerina skill's `library` agent (`ballerina:library`) |
| Migrate a Mirth Connect channel | `healthcare:mirth-to-ballerina` — once handed off, that skill's project layout and wording apply |

## If the Ballerina skill is missing

- **Claude Code:** installing `integrator` installs it automatically. If it is missing, run
  `/plugin install ballerina@wso2-agent-skills`.
- **Other agents (Codex, Cursor, Gemini CLI, GitHub Copilot, …):**
  `npx skills add ballerina-platform/skills`

## WSO2 Integrator conventions

- **Words.** A Ballerina workspace is a **project**; a Ballerina package is an **integration**.
- **Project layout.** A project is either a single integration — its root `Ballerina.toml` has a
  `[package]` section — or several integrations, where the root `Ballerina.toml` holds only a
  `[workspace]` section with a `packages` array. Keep the layout the project already has: work on
  a single-integration project in place. In a multi-integration project, a new integration is a
  directory with its own `Ballerina.toml` (`[package]` with `org`, `name`, `version`), added to the
  `packages` array. Prefer changing an existing integration over creating a new one unless the
  user asks for a new one.
- **Library integrations.** An integration meant to be reused by others must contain `lib.bal`
  with `import wso2/strict.library as _;` — without it the integration is treated as a regular
  one.
- **Automations.** An automation is an integration with a `main` function unless the user asks
  for a service. Schedules such as "every hour" or a cron expression are configured where the
  integration is deployed (Kubernetes or the integration platform), not written into the code —
  when the user asks for one, tell them that is where it goes.
- **Configurables.** Declare configurables only as `string`, `int`, `byte`, `float`, `decimal`,
  `boolean`, or arrays of them — never a subtype such as `int:Signed32`, even when a connector
  method takes one; widen to the base type and cast at the call. Never give a configurable a
  default value, with one exception: when a connector authenticates with an OAuth2 refresh-token
  grant, declare the refresh URL as `configurable string refreshUrl` and use it in the auth
  config, defaulting to the refresh URL the library's type definition gives if it gives one, and
  to `?` otherwise.

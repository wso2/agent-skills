# migrations Plugin — Agent Conventions

## Skills in this Plugin

- [`skills/mirth-to-ballerina/`](./skills/mirth-to-ballerina/SKILL.md) — migrate a Mirth Connect channel to a compilable Ballerina project

## mirth-to-ballerina Skill

Twelve-phase migration. `Ballerina.toml` and `Config.toml` are always mandatory; `types.bal`, `handlers.bal`, and `service.bal` are the optional source modules included based on channel needs (for simple channels, all three are needed; `utils.bal` is added only when shared helpers are required):
1. **Analyze** — parse the channel XML, map connector classes to Ballerina listener/client types
2. **Model the flow** — every channel becomes an `xlibb/pipeline` `HandlerChain` (processors, filters, transformers, destinations)
3. **Translate variable maps** — the seven Mirth maps (`channelMap`, `sourceMap`, `globalChannelMap`, etc.) map to `MessageContext` properties, content-record fields, or module-level `isolated` state
4. **Translate JavaScript** — three tiers: direct translation, typed stub with contract comment, or typed stub with full contract description for complex/stateful logic — never a partial translation
5. **Externalize config** — hosts, ports, credentials always go in `Config.toml`, never hardcoded

## Key Reference Files

- `skills/mirth-to-ballerina/references/connector-mappings.md` — connector class → Ballerina equivalent table, dependency-by-connector-type table, HL7v2 version selection guide
- `skills/mirth-to-ballerina/references/queue-modes.md` — Mirth queue-mode and queue-setting mapping tables, Queue on Response example
- `skills/mirth-to-ballerina/references/js-translation-examples.md` — worked examples for JS translation Cases A/B/C, Mirth global variable table, transformer step type table, common JS pattern translations

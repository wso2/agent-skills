# ballerina

Ballerina language support — LSP code intelligence and AI coding assistant.

## What it provides

- **Language Server**: code completions, go-to-definition, hover, semantic highlighting, and diagnostics for `.bal` files
- **`ballerina` skill**: write integrations and services, run and test projects

## Prerequisites

- Ballerina >= 2201.12.0 (Swan Lake Update 12+)
- `bal` command available in PATH
- Node.js >= 18 (for the bundled `ballerina-library` MCP server that powers the `library` discovery sub-agent)

The `library` sub-agent discovers Ballerina libraries via the bundled MCP server, which uses `bal search` plus the Ballerina Central API. The server ships self-contained — no `npm install` required after `/plugin install`.

## Installation

**1. Add the marketplace** (from GitHub, or a local clone):

```
/plugin marketplace add wso2/agent-skills
# or: /plugin marketplace add /path/to/agent-skills
```

**2. Install the plugin:**

```
/plugin install ballerina@wso2-agent-skills
```

**3. Restart the session.** This activates all four components:

- the **language server** for `.bal` files (completions, hover, diagnostics),
- the **`ballerina` skill** for writing/running/testing code,
- the **`library` discovery agent** (bundled `ballerina-library` MCP server),
- the **skill-reminder hooks**.

No `npm install` step is required — the MCP server ships pre-bundled at `mcp/dist/server.js`.

### Verify

```
/plugin              # confirm `ballerina` is listed and enabled
```

Open a `.bal` file and confirm completions appear, or ask the agent to "write a Ballerina HTTP service".

## Using the skill

After restart, the `ballerina` skill is available in two ways:

**Automatically** — the agent loads it when your request matches Ballerina work:
> "Write a Ballerina HTTP service" / "Run the Ballerina project" / "Fix this .bal file"

**Manually** — invoke directly:
```
/ballerina <your request>
```

## Uninstall

```
/plugin uninstall ballerina@wso2-agent-skills
/plugin marketplace remove wso2-agent-skills
```

Then restart the session.

## Skill reference files

The `ballerina` skill uses progressive disclosure — the agent loads these on demand:

| File | Loaded when |
|------|-------------|
| `code-rules.md` | Writing or modifying Ballerina code |
| `langlib-reference.md` | Looking up built-in language library APIs |
| `setup.md` | `bal` not found on the machine |

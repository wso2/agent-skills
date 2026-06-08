# Ballerina Code Rules

## Structure

- Define `configurable` variables for all external values (API keys, hosts, ports, credentials).
  - Allowed types: `string`, `int`, `decimal`, `boolean` only.
  - Never assign hardcoded default values to configurables.
- Initialize clients at module level, before any function or service declarations.
- Implement a `main` function OR a service — not both, unless the requirement explicitly needs both.

## Data

- Use records for all data structures. Never use `map<json>`, `map<anydata>`, or raw `json`.
- Never access or manipulate a `json` variable directly. Define a record, convert json to it (`cloneWithType()` or `fromJsonStringWithType()`), then use the record.
- If a return typedesc is marked `<>` in API docs, define a custom record for the expected data shape.
- If a parameter type is `record {|anydata...;|}`, define or reuse an explicit named record — do not pass an anonymous literal.
- If a return type is `record {|anydata...;|}`, decide the shape, declare a named record, and assign to it.
- When accessing a field of a record, assign it to a new typed variable first, then use that variable in the next statement.

## Identifiers

- Always use **two-word camelCase** for ALL identifiers: variables, parameters, record fields (e.g., `userName`, `baseUrl`, `responseBody`).

## Function Calls

- Dot notation (`.`) for normal functions. Arrow notation (`->`) for remote and resource functions.
- Resource function invocation: `clientVar->/path/["param"].get(key="value")`
- Always use **named arguments**: `client->post("/path", message = payload)` — never positional.

## Type Safety

- Declare types explicitly in all variable declarations and `foreach` statements.
- To narrow a union or optional type: assign to a separate typed variable first, then use it in the `if` condition.
- Do not invoke methods on json access expressions — always use a separate statement.

## Imports

- Each `.bal` file must have its own import statements.
- Do not import auto-imported langlibs: `lang.string`, `lang.boolean`, `lang.float`, `lang.decimal`, `lang.int`, `lang.map`.
- Packages with dots in names use aliases: `import org/package.one as one;`
- Submodules in `generated/<moduleName>/`: import as `import <packageName>.<moduleName>;` — the import should contain only the package name and submodule name, no path components.

## HTTP Service Design

When creating an HTTP service, define resource function signatures first with full return types:

```ballerina
resource function get users() returns UserList|http:NotFound|http:NotImplemented {
    return http:NOT_IMPLEMENTED;
}
```

Use `http:NotImplemented` as a placeholder return type initially, then implement each resource function.

## GraphQL Services

If the user requests a GraphQL service and has not provided their own schema:
- Write the proposed GraphQL schema first (before generating Ballerina code).
- Use the same names from the GraphQL schema when defining Ballerina record types.

## Workspace Projects

When working with a Ballerina workspace (root `Ballerina.toml` with a `[workspace]` section):

**Creating a new package:**
1. Create the package directory with a `Ballerina.toml` containing the `[package]` section (`name`, `org`, `version`).
2. Add the new package path to the `packages` array in the root workspace `Ballerina.toml`.
3. Create initial `.bal` files in the new package.

**Guidelines:**
- Always prefer modifying existing packages over creating new ones.
- The root workspace `Ballerina.toml` should only contain a `[workspace]` section.
- Do not modify existing package `Ballerina.toml` files for dependency management.

## Config.toml

- Never read `Config.toml` or `tests/Config.toml` directly — they may contain secrets.
- Providing values to configurables is a runtime task. Only do it before running or testing.
- If the user needs to supply values, list the configurable variable names in the summary.

## File Management

- Prefer modifying existing `.bal` files over creating new ones unless explicitly asked.
- Do not create documentation markdown files.
- **Never edit `Dependencies.toml`** — it is auto-managed by the build tool. Do not create, modify, or delete it.
- **Never edit `Ballerina.toml` to add dependencies** — add the `import` statement in the `.bal` file and run `bal build`; Ballerina resolves and downloads packages from Central automatically.

## Tests

- Only write tests if the user explicitly asks.
- Use the `ballerina/test` module and any service-specific test libraries.
- Follow the `instructions` field in `ballerina/test` library docs and the `testGenerationInstruction` field in the service library's API docs when writing tests.

## Other Rules

- No dynamic listener registrations.
- No code that requires assigning values to function parameters.
- `//` for single-line comments only. Keep comments minimal.

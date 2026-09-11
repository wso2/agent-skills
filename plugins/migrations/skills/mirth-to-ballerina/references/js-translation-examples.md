# JavaScript Translation Examples

Consulted during Phase 10 (Translating JavaScript). Pick the tier per the criteria in
`SKILL.md`, then use these examples as a template for the comment block and signature.

## Case A: Simple / directly translatable JS

Translate to idiomatic Ballerina:

```javascript
// channelMap.put('sendingApp', msg['MSH']['MSH.3']['MSH.3.1']);
```
→ `msgCtx.setProperty("sendingApp", adt.msh.msh3?.hd1 ?: "");`

```javascript
// var dateStr = DateUtil.formatDate(val, 'yyyyMMdd', 'yyyy-MM-dd');
```
→
```ballerina
// TODO: verify this matches DateUtil.formatDate behavior (timezone handling may differ)
string formatted = convertHl7Date(rawDate);
```

## Case B: Moderate complexity — typed helper stub

When the logic is non-trivial but inputs and outputs are clear, write a full typed signature with a comment block describing the contract precisely:

```ballerina
// Translates Mirth JS step "Normalize Patient Name" (transformer step 3):
// - Trims leading/trailing whitespace from each name component
// - Capitalizes first letter of each component; handles hyphenated names (e.g. "smith-jones" → "Smith-Jones")
// - Returns empty string for null/empty input
// Input: raw name string from PID.5 as received (may be all-caps or mixed case)
// Output: display-ready formatted name string
isolated function normalizePatientName(string rawName) returns string {
    // TODO: implement — see original Mirth JS "Normalize Patient Name" in transformer step 3
    return rawName;
}
```

## Case C: Complex / stateful JS — typed stub with full contract description

When the JS uses Mirth-specific globals, Java classes, cross-message state, or external integrations, **do not attempt a partial translation**. Generate a properly typed stub whose comment block fully describes expected behavior, inputs, outputs, error conditions, and original implementation caveats:

```ballerina
// Translates Mirth JS step "MRN Lookup and Dedup" (transformer step 5):
//
// Expected behavior:
// - Queries the MPI (Master Patient Index) using patientId + dateOfBirth as the lookup key
// - If a canonical MRN is found, returns it; otherwise generates a new UUID-based MRN
// - Deduplication: if two records share DOB + last name + first initial, merges and returns
//   the older record's MRN
// - Logs all lookups to the audit table regardless of hit/miss
//
// Original used: DatabaseConnectionFactory.getConnection('mpi_db'), globalChannelMap for caching
// Ballerina approach: use a module-level sql:Client; replace globalChannelMap cache with
//   a module-level isolated map<string> with lock{} (see globalChannelMap caveat in Phase 5)
//
// Parameters:
//   patientId   - raw PID.3.1 value (may be empty string — handle gracefully)
//   dateOfBirth - HL7 date string yyyyMMdd format (e.g. "19801215")
//   lastName    - PID.5.1 family name component
//   firstName   - PID.5.2 given name component
// Returns: canonical MRN string — never empty (generates new UUID if no match found)
// Errors: propagate sql:Error from DB; caller should let error bubble to pipeline failure store
isolated function lookupOrAssignMrn(string patientId, string dateOfBirth,
                                     string lastName, string firstName) returns string|error {
    // TODO: implement — see original Mirth JS "MRN Lookup and Dedup" in transformer step 5
    return uuid:createType1AsString();
}
```

**Use Case C whenever the JS step involves:**
- `DatabaseConnectionFactory` / any JDBC call
- `globalChannelMap` / `globalMap` with cross-message semantics
- Java class instantiation (`Packages.com.mirth.*`, `java.util.*`)
- `AttachmentUtil`, `VMRouter`, `router.routeMessage()`
- Regex with Java-specific flags or lookaheads that differ from Ballerina regex
- `DateUtil` date arithmetic where timezone behavior is load-bearing

## Mirth global variables → Ballerina

| Mirth JS variable | Ballerina equivalent |
|---|---|
| `msg` (E4X XML object) | Typed HL7 record via `msgCtx.getContentWithType()` |
| `tmp` | Local variable in the handler function |
| `channelMap` / `$c` | `msgCtx.setProperty()` / `getPropertyWithType()` |
| `connectorMap` / `$co` | Local variable scoped to the current handler function |
| `sourceMap` / `$s` | Properties set on `MessageContext` before pipeline entry, or fields in the content record |
| `responseMap` / `$r` | `ExecutionSuccess.destinationResults[destinationId]` |
| `globalChannelMap` / `$gc` | Module-level `isolated map<anydata>` with `lock{}` + TODO caveat |
| `globalMap` / `$g` | Module-level shared state with `lock{}` |
| `configurationMap` / `$cfg` | `configurable` Ballerina variables |
| `DateUtil`, `UUIDGenerator` | `ballerina/time`, `ballerina/uuid` |
| `logger.info(...)` | `log:printInfo(...)` |
| `router.routeMessage(...)` | Pipeline destination or `start destinationFn(...)` |

## Reference: Mirth Transformer Step Types

| Mirth step type | Ballerina approach |
|---|---|
| `MessageBuilderStep` | Record field assignment in a `TransformerConfig` |
| `MapperStep` | Direct assignment or `match` expression |
| `IteratorStep` | `foreach` loop; nested iterators → nested `foreach` |
| `JavaScriptStep` (simple) | Translate directly (Case A) |
| `JavaScriptStep` (moderate) | Typed stub with contract comment (Case B) |
| `JavaScriptStep` (complex/stateful) | Typed stub with full contract description (Case C) |
| `ExternalStep` (DB lookup) | `sql:Client` parameterized query in a `ProcessorConfig` |
| `DestinationSetFilterStep` | `msgCtx` property + per-destination `FilterConfig` |
| `RuleBuilderStep` (filter) | `FilterConfig` boolean function |
| `JavaScriptRule` (filter) | `FilterConfig` boolean function |

## Reference: Common Mirth JS Patterns

```javascript
// Check message type
msg['MSH']['MSH.9']['MSH.9.1'].toString() == 'ADT'
// → adt.msh.msh9?.cm_msg1 == "ADT"

// Get patient ID
msg['PID']['PID.3']['PID.3.1'].toString()
// → adt.pid?.pid3?[0]?.cx1 ?: ""

// channelMap.put / get
channelMap.put('key', value)  /  channelMap.get('key')
// → msgCtx.setProperty("key", value)  /  msgCtx.getPropertyWithType("key")

// connectorMap (destination-local)
connectorMap.put('key', value)
// → local variable within the destination handler function

// globalChannelMap (cross-message, in-memory)
globalChannelMap.put('key', value)  /  globalChannelMap.get('key')
// → module-level isolated map<anydata> with lock{}  (emit Case C TODO caveat)

// sourceMap (read-only, injected by source)
sourceMap.get('originalFilename')
// → pass as field in content record to execute(), or initial msgCtx property

// responseMap (destination responses)
responseMap.get('dest1')
// → result.destinationResults["dest1"] after channelPipeline.execute() returns

// Date formatting
DateUtil.formatDate(dateStr, 'yyyyMMdd', 'yyyy-MM-dd')
// → Case A if format is known; Case C stub if timezone behavior is load-bearing

// Re-queue on AE ACK
responseStatus = QUEUED
// → return error(...) from destination function to trigger retryConfig
```

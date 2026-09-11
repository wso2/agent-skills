---
name: mirth-to-ballerina
description: >
  Migrates Mirth Connect channel XML to a compilable Ballerina project (Ballerina.toml + modules).
  Prioritizes HL7v2 MLLP/LLP listeners and TCP senders. Translates JavaScript transformers, filters,
  and channel-level scripts into idiomatic Ballerina code, generating typed stubs with full contract
  comments where the translation is ambiguous.

  Use this skill whenever the user:
  - Shares a Mirth Connect channel.xml file or channel XML snippet and wants it converted to Ballerina
  - Mentions migrating from Mirth Connect to Ballerina Integrator or WSO2 Integration
  - Asks how to implement an HL7v2 MLLP listener, MLLP sender, or TCP HL7 channel in Ballerina
  - Wants to translate Mirth JavaScript transformers, filters, or channel scripts to Ballerina
  - Needs a Ballerina project that replaces a Mirth channel pipeline
  - Asks about Mirth Connect channel migration to any Ballerina-based platform
---

# Mirth Connect → Ballerina Migration Skill

You are an expert in both Mirth Connect and Ballerina healthcare integration. When given a Mirth Connect channel XML, produce a **complete, compilable Ballerina project** that faithfully reproduces the channel's behavior.

## What You Always Produce

Every migration results in a project directory containing:

```
<channel-name>/
├── Ballerina.toml
├── Config.toml         (configurable values, no hardcoded secrets)
├── types.bal           (record type definitions)
├── handlers.bal        (pipeline processors, filters, transformers, destinations)
├── service.bal         (HandlerChain wiring + listener)
└── utils.bal           (shared helpers — only if needed)
```

Only include files that are actually needed. For simple channels, `types.bal` + `handlers.bal` + `service.bal` is enough.

---

## Phase 1: Analyze the Channel XML

Parse the XML and identify:

| XML element | What to look for |
|---|---|
| `<sourceConnector>` | Connector class → listener type (MLLP, HTTP, File, etc.) |
| `<destinationConnectors>` | Each destination's class, properties, and queue settings |
| `<transformer>` | Step list: `<step>` elements with `<type>` and `<script>` |
| `<filter>` | Rule list: `<rule>` elements with `<type>` and `<script>` |
| `<responseTransformer>` | Post-send response handling logic |
| `<properties>` | Port, host, encoding, transmission mode, data type |
| `<preprocessorScript>` | Per-message raw message mutation (runs before source filter) |
| `<postprocessorScript>` | Per-message post-processing (runs after all destinations) |
| `<deployScript>` | One-time channel startup logic |
| `<undeployScript>` | One-time channel teardown logic |

See `references/connector-mappings.md` for the full connector class → Ballerina equivalent table.

---

## Phase 2: Build the Ballerina.toml

```toml
[package]
org = "healthcare"
name = "<channel_name_snake_case>"
version = "1.0.0"
distribution = "2201.12.2"

[build-options]
observabilityIncluded = true
```

See `references/connector-mappings.md` for the dependency-by-connector-type table and the HL7v2 version package selection guide.

---

## Phase 3: MLLP Listener — Use the HL7v2 Service API

**Do not manually strip MLLP frames or call `hl7v2:parse()` yourself.** The `ballerinax/health.hl7v2` library provides `Hl7Listener` + `Hl7Service` that handle MLLP framing (0x0B start, 0x1C 0x0D end) and parsing internally.

```ballerina
import ballerina/log;
import ballerinax/health.hl7v2;
import ballerinax/health.hl7v23;
import xlibb/pipeline;

configurable int mllpPort = 2575;

// Hl7Listener handles MLLP framing and hl7v2:parse() internally.
// Your service receives an already-parsed hl7v2:Message.
listener hl7v2:Hl7Listener mllpListener = new (mllpPort);

service hl7v2:Hl7Service on mllpListener {
    isolated remote function onMessage(hl7v2:Hl7Client caller, hl7v2:Message message) returns error? {
        pipeline:ExecutionSuccess|pipeline:ExecutionError result = channelPipeline.execute(message);
        if result is pipeline:ExecutionError {
            log:printError("Pipeline execution failed", 'error = result,
                           messageId = result.detail().message.id);
        }
    }
}
```

For **HTTP source connectors**:

```ballerina
service /api/v1 on new http:Listener(httpPort) {
    resource function post messages(http:Request request) returns http:Accepted|error {
        string payload = check request.getTextPayload();
        _ = start channelPipeline.execute(payload);
        return http:ACCEPTED;
    }
}
```

For **File Reader source connectors**:

```ballerina
service "fileWatcher" on new file:Listener({path: watchDirectory, recursive: false}) {
    remote function onModify(file:FileEvent event) returns error? {
        string content = check io:fileReadString(event.name);
        // sourceMap equivalent: pass filename as a pipeline property via a wrapper record
        _ = check channelPipeline.execute({content, originalFilename: event.name});
    }
}
```

---

## Phase 4: Model the Message Flow as a `HandlerChain` (xlibb/pipeline)

Every Mirth channel is a pipeline: source → preprocessor → source filter/transformer → destinations → postprocessor. Map it directly to `xlibb/pipeline`:

| Mirth concept | `xlibb/pipeline` equivalent |
|---|---|
| Source connector | Listener that calls `handlerChain.execute(message)` |
| Preprocessor Script | `@pipeline:ProcessorConfig` as first processor — mutates raw content before filtering |
| Source filter rules | `@pipeline:FilterConfig` function — `false` drops the message |
| Source transformer steps | `@pipeline:TransformerConfig` function — return value becomes new content |
| Side-effect steps (DB lookup, log) | `@pipeline:ProcessorConfig` function — sets properties, no content change |
| Destination connector | `@pipeline:DestinationConfig` function |
| Multiple destinations | Multiple destination functions — run **in parallel** automatically |
| Destination filter | Per-destination `FilterConfig` processor or `MessageMetadata.destinationsToSkip` |
| Response Transformer / Postprocessor | Logic inside the destination function after the send call |

### HandlerChain skeleton

```ballerina
import xlibb/pipeline;
import ballerinax/rabbitmq;

// Failure stores — use rabbitmq:MessageStore or any pipeline:Store implementation.
// Omit replayListenerConfig entirely if the original channel has no persistent queue ("Never" mode).
final rabbitmq:MessageStore failureStore   = check new ("channel-failure-store");
final rabbitmq:MessageStore deadLetterStore = check new ("channel-dead-letter-store");

final pipeline:HandlerChain channelPipeline = check new (
    name = "<channel-name>",
    processors = [
        preprocessMessage,       // Preprocessor Script → first processor
        filterByMessageType,     // Source filter → FilterConfig
        transformMessage,        // Source transformer → TransformerConfig
        lookupPatientInDb        // Side-effect step → ProcessorConfig
    ],
    destinations = [
        sendToFhirServer,        // Destinations run in parallel
        writeAuditLog
    ],
    failureStore = failureStore,
    replayListenerConfig = {     // Include only if Mirth queue mode is "On Failure" or "Always"
        pollingInterval: 5,
        maxRetries: 3,
        retryInterval: 2,
        deadLetterStore: deadLetterStore
    }
);
```

---

## Phase 5: Variable Maps → Ballerina

Mirth has seven variable maps with distinct scopes. Map each one as follows:

| Mirth map | JS variable | Scope | Ballerina equivalent |
|---|---|---|---|
| **Connector Map** | `connectorMap` / `$co` | Current message, current connector only | Local variables within a single handler function |
| **Channel Map** | `channelMap` / `$c` | Current message, shared across all destinations | `msgCtx.setProperty(key, value)` / `getPropertyWithType(key)` |
| **Source Map** | `sourceMap` / `$s` | Current message, read-only, injected by source | Initial properties on the `MessageContext` — pass as fields in the content record passed to `execute()`, or extract in the first `ProcessorConfig` |
| **Response Map** | `responseMap` / `$r` | Current message, destination responses | Destination function return value stored in `ExecutionSuccess.destinationResults[id]`; read by postprocessor logic |
| **Global Channel Map** | `globalChannelMap` / `$gc` | All messages in this channel, in-memory only | Module-level `isolated map<anydata>` with `lock{}` — see caveat below |
| **Global Map** | `globalMap` / `$g` | All messages, all channels, in-memory only | Module-level shared state with `lock{}`; consider an external cache for cross-service sharing |
| **Configuration Map** | `configurationMap` / `$cfg` | Read-only server config | `configurable` Ballerina variables in `Config.toml` |

**globalChannelMap / globalMap caveat** — always emit this TODO when these maps are used:

```ballerina
// TODO: globalChannelMap translated to module-level isolated map with lock{}.
// Caveats vs Mirth:
// 1. Reset on service restart — values are not persisted across deployments.
// 2. Not shared across multiple service instances — use Redis or a DB table if
//    horizontal scaling or restart-survival is required.
// 3. Mirth's globalChannelMap is a ConcurrentHashMap and does not allow null values —
//    maintain this invariant by never storing () here.
isolated map<anydata> globalChannelState = {};
```

**sourceMap variables injected by specific connectors:**

| Mirth source connector | Automatic sourceMap keys | Ballerina approach |
|---|---|---|
| File Reader | `originalFilename`, `fileDirectory`, `fileSize`, `fileLastModified` | Include in the content wrapper record passed to `execute()` |
| HTTP Listener | `remoteAddress`, `localAddress`, HTTP headers as `http.*` | Extract from `http:Request` before calling `execute()` and pass in the wrapper |
| Database Reader | Column names from the query result | Include as fields in the content record |
| Channel Writer (upstream) | Any variables injected by upstream channel | Document as a TODO — requires tracing the upstream channel |

---

## Phase 6: Channel-Level Scripts

Mirth channels have four lifecycle scripts. Translate each as follows:

### Deploy Script → module `init`

Runs once when the channel is deployed. Typically initializes DB connections, loads config from files, or seeds `globalChannelMap`.

```ballerina
// In service.bal — Ballerina module init runs once at startup, equivalent to Mirth Deploy Script.
// Original Deploy Script: loaded patient lookup cache from DB into globalChannelMap.
function init() returns error? {
    // TODO: implement — see original Deploy Script in <deployScript> element
    // Original used: DatabaseConnectionFactory.getConnection('mpi_db') to pre-load cache
    log:printInfo("Channel initialized");
}
```

### Undeploy Script → graceful stop / cleanup function

Runs once when the channel is undeployed. Typically closes DB connections or flushes state.

```ballerina
// Ballerina does not have a direct undeploy hook — use a graceful stop handler or
// implement cleanup in a function called at program termination.
// TODO: implement cleanup — see original Undeploy Script in <undeployScript> element
isolated function cleanupResources() returns error? {
    // e.g. close sql:Client connections, flush caches
}
```

### Preprocessor Script → first `ProcessorConfig` in the pipeline

Runs after the source connector receives the message but before the source filter/transformer. It receives the raw message as a string and its return value replaces the raw message. Translate to the first processor in the `HandlerChain`:

```ballerina
// Translates Mirth Preprocessor Script — mutates raw message string before filtering.
// Original: stripped BOM characters and normalized line endings before HL7 parsing.
@pipeline:ProcessorConfig {id: "preprocess_raw_message"}
isolated function preprocessMessage(pipeline:MessageContext msgCtx) returns error? {
    string raw = check msgCtx.getContentWithType();
    // TODO: implement — see original <preprocessorScript> element
    // Original used: message.replace('﻿', '').replace('\r\n', '\r')
    string normalized = raw; // placeholder
    msgCtx.setProperty("preprocessedRaw", normalized);
}
```

### Postprocessor Script → logic at the end of the last destination / response handling

Runs after all destinations complete. Has access to all destination responses via `responseMap`. Its return value can be used as the response sent back to the source connector. Translate by reading `ExecutionSuccess.destinationResults` after `execute()` returns:

```ballerina
service hl7v2:Hl7Service on mllpListener {
    isolated remote function onMessage(hl7v2:Hl7Client caller, hl7v2:Message message) returns error? {
        pipeline:ExecutionSuccess|pipeline:ExecutionError result = channelPipeline.execute(message);
        // Postprocessor equivalent: inspect destination results and send back a response
        if result is pipeline:ExecutionSuccess {
            // responseMap equivalent: result.destinationResults["dest-id"] holds each destination's return value
            _ = check postprocess(caller, result);
        } else {
            log:printError("Pipeline failed", 'error = result, messageId = result.detail().message.id);
        }
    }
}

// Translates Mirth Postprocessor Script — assembles final response to originating system.
// Original: checked ACK code from HL7 destination response; re-queued on AE, sent AA on success.
isolated function postprocess(hl7v2:Hl7Client caller, pipeline:ExecutionSuccess result) returns error? {
    // TODO: implement — see original <postprocessorScript> element
    // responseMap.get('dest1') → result.destinationResults["dest1"]
}
```

---

## Phase 7: Writing Handlers in `handlers.bal`

### Filters — translate Mirth source/destination filter rules

```ballerina
import xlibb/pipeline;
import ballerinax/health.hl7v2;
import ballerinax/health.hl7v23;

@pipeline:FilterConfig {id: "filter_message_type"}
isolated function filterByMessageType(pipeline:MessageContext msgCtx) returns boolean|error {
    hl7v2:Message msg = check msgCtx.getContentWithType();
    hl7v23:ADT_A01|error adtA01 = msg.ensureType(hl7v23:ADT_A01);
    return adtA01 is hl7v23:ADT_A01;
}
```

A `FilterConfig` returning `false` drops the message silently. Returning `error` routes it to the failure store. For compound filter rules (Mirth ANDs them), write one function per logical concern and list them sequentially in `processors`.

### Transformers — translate Mirth transformer steps

```ballerina
@pipeline:TransformerConfig {id: "extract_patient"}
isolated function extractPatient(pipeline:MessageContext msgCtx) returns PatientRecord|error {
    hl7v2:Message msg = check msgCtx.getContentWithType();
    hl7v23:ADT_A01 adt = check msg.ensureType(hl7v23:ADT_A01);
    return {
        patientId: adt.pid?.pid3?[0]?.cx1 ?: "",
        lastName:  adt.pid?.pid5?[0]?.xpn1 ?: "",
        firstName: adt.pid?.pid5?[0]?.xpn2 ?: "",
        dob:       adt.pid?.pid7?.ts1 ?: ""
    };
}
```

**HL7v2 field access — always use optional chaining, never assume fields exist:**

```ballerina
// Mirth: msg['PID']['PID.3']['PID.3.1']      → adt.pid?.pid3?[0]?.cx1 ?: ""
// Mirth: msg['MSH']['MSH.4']['MSH.4.1']      → adt.msh.msh4?.hd1 ?: ""
// Mirth: msg['MSH']['MSH.9']['MSH.9.1']      → adt.msh.msh9?.cm_msg1 ?: ""
// Mirth: foreach NK1 segment                  → foreach hl7v23:NK1 nk1 in adt.nk1 ?: []
// Mirth: for each OBX                         → foreach hl7v23:OBX obx in msg.obx ?: []
```

### GenericProcessors — side-effect steps

```ballerina
@pipeline:ProcessorConfig {id: "db_patient_lookup"}
isolated function lookupPatientInDb(pipeline:MessageContext msgCtx) returns error? {
    PatientRecord patient = check msgCtx.getContentWithType();
    boolean exists = check patientExistsInDb(patient.patientId);
    msgCtx.setProperty("patientExists", exists);  // channelMap equivalent
}
```

Read downstream with: `boolean exists = check msgCtx.getPropertyWithType("patientExists");`

### Destinations — translate Mirth destination connectors

```ballerina
@pipeline:DestinationConfig {
    id: "send_to_fhir",
    retryConfig: {maxRetries: 3, retryInterval: 2}
}
isolated function sendToFhirServer(pipeline:MessageContext msgCtx) returns json|error {
    PatientRecord patient = check msgCtx.getContentWithType();
    http:Client fhirClient = check new (fhirServerUrl);
    json response = check fhirClient->/Patient.post(patient);
    // Response transformer equivalent: inspect response here before returning
    return response;
}
```

---

## Phase 8: Destination Queuing → Pipeline Configuration

Mirth has three queue modes per destination (Never, On Failure, Always), mapped onto
`@pipeline:DestinationConfig` retry config and `HandlerChain` failure/replay config.

See `references/queue-modes.md` for the full queue-mode and queue-setting mapping tables
and the Queue on Response translation example.

---

## Phase 9: MLLP Sender (TCP Dispatcher)

```ballerina
import ballerinax/health.clients.hl7;
import ballerinax/health.hl7v2;

configurable string destHost = "downstream.example.com";
configurable int destPort = 2575;

final hl7:HL7Client hl7Client = check new (destHost, destPort);

// HL7Client handles MLLP framing automatically — do not wrap bytes manually.
@pipeline:DestinationConfig {id: "send_hl7_downstream", retryConfig: {maxRetries: 3, retryInterval: 2}}
isolated function sendToDownstream(pipeline:MessageContext msgCtx) returns hl7v2:Message|error {
    hl7v2:Message msg = check msgCtx.getContentWithType();
    hl7v2:Message|hl7v2:HL7Error ack = hl7Client->sendMessage(msg);
    if ack is hl7v2:HL7Error {
        return error("HL7 send failed: " + ack.toString());
    }
    return ack;
}
```

---

## Phase 10: Translating JavaScript — Three Cases

Classify each JS step into one of three tiers — never a partial translation:

- **Case A — Simple / directly translatable**: translate straight to idiomatic Ballerina.
- **Case B — Moderate complexity**: write a full typed signature with a comment block describing the contract precisely, body as a `TODO` stub.
- **Case C — Complex / stateful**: do not attempt a partial translation. Generate a typed stub whose comment block fully describes expected behavior, inputs, outputs, error conditions, and original implementation caveats.

**Use Case C whenever the JS step involves:**
- `DatabaseConnectionFactory` / any JDBC call
- `globalChannelMap` / `globalMap` with cross-message semantics
- Java class instantiation (`Packages.com.mirth.*`, `java.util.*`)
- `AttachmentUtil`, `VMRouter`, `router.routeMessage()`
- Regex with Java-specific flags or lookaheads that differ from Ballerina regex
- `DateUtil` date arithmetic where timezone behavior is load-bearing

See `references/js-translation-examples.md` for worked examples of each case, the
Mirth global variable → Ballerina table, the transformer step type table, and common
Mirth JS pattern translations.

---

## Phase 11: Configuration (Config.toml)

Always externalize connection parameters. Never hardcode hosts, ports, credentials, or paths in `.bal` files.

```toml
mllpListenPort = 2575
destinationHost = "localhost"
destinationPort = 2576
outputDirectory = "./output"

[db]
host = "localhost"
port = 3306
user = "dbuser"
password = ""   # set via environment: BAL_CONFIG_SECRET_db_password
database = "mirthdb"
```

For database `DbConfig` records, annotate the password field:

```ballerina
public type DbConfig record {|
    string host;
    int port;
    string user;
    @sql:SensitiveConfig
    string password;
    string database;
|};
```

---

## Phase 12: Error Handling

The pipeline `failureStore` handles routing of failed messages. Within individual handlers use `do...on fail` for grouped operations that should be treated as a unit:

```ballerina
@pipeline:TransformerConfig {id: "enrich_and_validate"}
isolated function enrichAndValidate(pipeline:MessageContext msgCtx) returns EnrichedRecord|error {
    do {
        hl7v2:Message msg = check msgCtx.getContentWithType();
        hl7v23:ADT_A01 adt = check msg.ensureType(hl7v23:ADT_A01);
        EnrichedRecord enriched = check buildEnrichedRecord(adt);
        check validateEnrichedRecord(enriched);
        return enriched;
    } on fail error e {
        log:printError("Enrichment failed", 'error = e);
        return e;
    }
}
```

---

## Output Format

After analyzing the channel XML, output **all files in sequence** using labeled code blocks:

```
### Ballerina.toml
### types.bal
### handlers.bal
### service.bal
### Config.toml
```

After all files, include a **Migration Notes** section with these subsections:

1. **Stubs to implement** — each Case B/C stub function: its name, the original Mirth step it replaces, and what the developer must implement
2. **Assumptions & Gaps** — only list items where essential behavior is truly missing from the XML and a safe configurable default was used; keep this list short and precise
3. **Configuration** — values the user must fill in (hosts, ports, credentials, queue DSN, etc.)
4. **Mirth behaviors without direct equivalents** — persistent channel maps, attachment handling, message re-queuing, Channel Writer cross-channel routing — with the suggested Ballerina approach
5. **How to run** — `bal run`

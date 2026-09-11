# Connector & Dependency Mappings

Consulted during Phase 1 (Analyze) and Phase 2 (Build the Ballerina.toml).

## Connector class → Ballerina equivalent

| Mirth connector class | Ballerina equivalent |
|---|---|
| `com.mirth.connect.connectors.tcp.TcpReceiver` (MLLP) | `hl7v2:Hl7Listener` + `hl7v2:Hl7Service` |
| `com.mirth.connect.connectors.tcp.TcpDispatcher` (MLLP) | `health.clients.hl7:HL7Client` |
| `com.mirth.connect.connectors.http.HttpReceiver` | `http:Listener` service |
| `com.mirth.connect.connectors.http.HttpDispatcher` | `http:Client` |
| `com.mirth.connect.connectors.file.FileReceiver` | `file:Listener` + `io` |
| `com.mirth.connect.connectors.file.FileDispatcher` | `io:fileWriteString` |
| `com.mirth.connect.connectors.jdbc.DatabaseReader` | `sql` + DB connector |
| `com.mirth.connect.connectors.jdbc.DatabaseWriter` | `sql` + DB connector |
| `com.mirth.connect.connectors.js.JavaScriptReader` | Ballerina service (translate logic) |
| `com.mirth.connect.connectors.js.JavaScriptWriter` | Ballerina function (translate logic) |
| `com.mirth.connect.connectors.vm.VmReceiver` | `tcp:Listener` or `http:Listener` depending on data type |
| `com.mirth.connect.connectors.vm.VmDispatcher` (Channel Writer) | Direct function call or pipeline destination |

## Dependencies by connector type

Add to `Ballerina.toml` based on what connectors are present:

| Connector type | Dependency to add |
|---|---|
| HL7v2 MLLP listener/sender | `ballerinax/health.hl7v2`, `ballerinax/health.hl7v2<ver>` (e.g. `health.hl7v23`), `ballerinax/health.clients.hl7` |
| HTTP | (stdlib, no extra dep) |
| File | (stdlib) |
| Database (MySQL) | `ballerinax/mysql` + `ballerina/sql` |
| Database (PostgreSQL) | `ballerinax/postgresql` + `ballerina/sql` |
| Email/SMTP | `ballerina/email` |
| FTP/SFTP | `ballerina/ftp` |
| JMS / queuing | `ballerinax/rabbitmq` |
| HL7v2 → FHIR conversion | `ballerinax/health.hl7v2<ver>.utils.v2tofhirr4` |
| **Always include** | `xlibb/pipeline`, `ballerina/log`, `ballerina/uuid`, `ballerina/time` |

## HL7v2 version package selection

- `hl7v23` for HL7 2.3 / 2.3.1 — `hl7v24` for 2.4 — `hl7v25`/`hl7v251` for 2.5/2.5.1
- `hl7v26` for 2.6 — `hl7v27` for 2.7 — `hl7v28` for 2.8

If not explicit in the channel XML, check `MSH.12` in example messages. Default to `hl7v23` for old channels.

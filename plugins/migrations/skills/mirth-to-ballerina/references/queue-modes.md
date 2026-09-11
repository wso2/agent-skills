# Destination Queue Mode Mappings

Consulted during Phase 8 (Destination Queuing).

## Mirth Queue Mode → pipeline behavior

| Mirth Queue Mode | Behavior | Ballerina equivalent |
|---|---|---|
| **Never** | No queuing; fail fast on error | No `retryConfig` on `@pipeline:DestinationConfig`; no `replayListenerConfig` on `HandlerChain` |
| **On Failure** | Retry on error, up to retry count | `retryConfig: {maxRetries: N, retryInterval: S}` on `@pipeline:DestinationConfig` |
| **Always** | Queue every message before sending (store-and-forward) | `failureStore` + `replayListenerConfig` on `HandlerChain`; all destinations receive messages via replay |

## Mirth queue settings → pipeline config

| Mirth setting | Ballerina mapping |
|---|---|
| Retry Count Before Queue | `retryConfig.maxRetries` on `@pipeline:DestinationConfig` |
| Retry Interval (ms) | `retryConfig.retryInterval` (in seconds) on `@pipeline:DestinationConfig` |
| Queue Buffer Size / Queue Threads | No direct equivalent — pipeline destinations run concurrently by default |
| Rotate Queue | `replayListenerConfig` naturally rotates via polling — failed messages are retried in order |
| Max Retry Count (replay) | `replayListenerConfig.maxRetries` on `HandlerChain` |
| Dead Letter (exhausted retries) | `replayListenerConfig.deadLetterStore` on `HandlerChain` |

## Queue on Response

Mirth re-queues based on the response transformer's `responseStatus`. Translate to a conditional error return inside the destination function — returning an `error` triggers the retry mechanism:

```ballerina
@pipeline:DestinationConfig {id: "hl7_sender", retryConfig: {maxRetries: 5, retryInterval: 3}}
isolated function sendHl7WithAckCheck(pipeline:MessageContext msgCtx) returns hl7v2:Message|error {
    hl7v2:Message msg = check msgCtx.getContentWithType();
    hl7v2:Message|hl7v2:HL7Error ack = hl7Client->sendMessage(msg);
    if ack is hl7v2:HL7Error {
        return error("HL7 send failed: " + ack.toString());
    }
    // Re-queue on AE equivalent: inspect ACK and return error to trigger retry
    hl7v23:ACK typedAck = check ack.ensureType(hl7v23:ACK);
    string ackCode = typedAck.msa?.msa1 ?: "";
    if ackCode == "AE" {
        string errMsg = typedAck.msa?.msa3 ?: "Application Error";
        return error("Application Error NACK received: " + errMsg);  // triggers retryConfig
    }
    return ack;
}
```

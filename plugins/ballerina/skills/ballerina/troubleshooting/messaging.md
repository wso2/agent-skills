# Messaging Connectors — Kafka, RabbitMQ, NATS, JMS

Messaging connectors share recurring failure modes: broker reachability, auth, destination existence, and consumer/producer config mismatches.

## Kafka

| Error / symptom                     | Likely cause                                       | Fix                                                                                          |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Connection refused` to broker      | Kafka not running, wrong bootstrap server, network | Verify the broker address in `kafka:ProducerConfiguration` / `kafka:ConsumerConfiguration`   |
| `Leader not available`              | Topic missing, or broker in election               | Create the topic; wait for leader election to finish                                          |
| `SASL authentication failure`       | Wrong credentials or wrong SASL mechanism          | Verify `securityProtocol` and SASL configuration                                              |
| Consumer not receiving messages     | Wrong `groupId` or `autoOffsetReset`               | Use a unique `groupId` per consumer group; set `autoOffsetReset = "earliest"` during testing  |
| Messages published but not consumed | Listener up but not dispatching                    | Check `pollingInterval`, `concurrentConsumers`, and that the service is attached              |

Reference consumer config:

```ballerina
kafka:ConsumerConfiguration consumerConfig = {
    groupId: "my-group",          // must be unique per consumer group
    topics: ["my-topic"],
    pollingInterval: 1,           // seconds between polls
    autoOffsetReset: "earliest",  // start from the beginning for new groups
    autoCommit: false             // manual commit is more reliable
};
```

## RabbitMQ

| Error / symptom                     | Likely cause                                                                                  | Fix                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Connection refused`                | RabbitMQ not running, wrong host/port (default 5672)                                          | Verify host/port; check the management UI                                                                                  |
| `ACCESS_REFUSED`                    | Wrong user/password or missing vhost permissions                                              | Confirm credentials and vhost configuration                                                                                |
| `NOT_FOUND` on queue/exchange       | Resource not declared on the broker                                                           | Declare the queue first (`queueDeclare()`) or create it through the management UI                                          |
| Messages not delivered              | Wrong routing key or exchange type                                                            | Producer and consumer must agree on exchange type and routing key                                                          |
| Messages published but not consumed | Exchange/queue binding mismatch — type, routing key, or arguments differ                      | Ensure `queueBind()` uses the same exchange name, routing key, and arguments as the exchange declaration                   |

> Ballerina's RabbitMQ client requires queues to exist before consumption. Use `channel->queueDeclare({queueName: "my-queue"})` (or pre-create the queue on the broker). Consuming from a missing queue triggers `NOT_FOUND` and closes the channel.

## NATS

`import ballerinax/nats;`

| Error / symptom                                         | Likely cause                                                                            | Fix                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Connection refused` on port 4222                       | NATS not running or wrong address                                                       | Default is `nats://localhost:4222` — verify the URL                                                            |
| Messages not received                                   | Subject mismatch                                                                        | Subjects are case-sensitive and must match exactly — check spelling                                            |
| Subscriber receives nothing despite correct subject     | Queue group with only one member, or unintended queue-group routing                     | Audit `queueName`; without a queue group, every subscriber gets every message                                  |
| `Authorization Violation`                               | Missing or wrong credentials                                                            | Configure `auth` in `nats:ConnectionConfiguration` (token, user/password, or NKey)                             |
| Messages lost                                           | Core NATS is fire-and-forget                                                            | Use NATS JetStream (`ballerinax/nats.jetstream`) for at-least-once delivery                                    |

Subject wildcards:

| Pattern | Matches                                   | Example                                                  |
| ------- | ----------------------------------------- | -------------------------------------------------------- |
| `*`     | One token                                 | `orders.*` matches `orders.new`, not `orders.us.new`     |
| `>`     | One or more tokens (must be the last seg) | `orders.>` matches both `orders.new` and `orders.us.new` |

Queue groups distribute messages across members (load balancing). Without a queue group, every subscriber receives every message (fan-out).

## JMS

`import ballerinax/java.jms;`

| Error / symptom                             | Likely cause                                                            | Fix                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Connection refused`                        | Broker not running or wrong URL                                         | Verify `initialContextFactory` and `providerUrl` in the connection config                          |
| Messages not consumed                       | `connection.start()` not called — JMS connections begin in stopped mode | Call `start()` on the connection before consuming                                                  |
| `Queue not found` / `Destination not found` | Queue/topic missing on the broker                                       | Create the destination on the broker, or enable auto-creation if supported                         |
| `Authentication failed`                     | Wrong credentials                                                       | Verify username/password in `jms:ConnectionConfiguration`                                          |
| `ClassNotFoundException` for the provider   | Provider JAR missing from classpath                                     | Add the JMS provider JAR (e.g. ActiveMQ client) under `[[platform.java17.dependency]]` in `Ballerina.toml` |

Provider notes:

- **ActiveMQ** — `initialContextFactory = "org.apache.activemq.jndi.ActiveMQInitialContextFactory"`, `providerUrl = "tcp://localhost:61616"`. Requires the ActiveMQ client JAR as a platform dependency.
- **IBM MQ** — Use the IBM MQ JMS client JAR. Connection factory setup typically uses JNDI or direct configuration with `MQQueueConnectionFactory`. Refer to IBM MQ's documentation for the required properties.

> JMS in Ballerina runs over Java interop. Provider JARs must be declared in `Ballerina.toml` under `[[platform.java17.dependency]]` (or the matching Java version).

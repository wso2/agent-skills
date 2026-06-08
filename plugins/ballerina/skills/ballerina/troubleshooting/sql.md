# SQL / Database Issues

## Connection failures

The most common SQL problem is failing to connect:

```
error: {ballerina/sql}DatabaseError Communications link failure: ...
```

Walk this checklist in order:

1. **Confirm credentials and endpoint** — host, port, user, password, database name.
2. **Verify network reachability** from the host running Ballerina: `telnet <host> <port>` or `nc -zv <host> <port>`.
3. **Confirm the JDBC driver is imported.** This is the single most common cause of cryptic connection failures. The driver package must appear as an empty import, otherwise the client cannot initialize:

   ```ballerina
   import ballerinax/mysql.driver as _;        // MySQL
   import ballerinax/mssql.driver as _;        // SQL Server
   import ballerinax/postgresql.driver as _;   // PostgreSQL
   ```

   Without the driver import you'll often see `No suitable driver found for jdbc:...` or a generic init failure.
4. **Check whether the connection pool is exhausted.** See [performance.md](performance.md) for pool tuning.

### Typical client initialization

```ballerina
mysql:Client dbClient = check new (
    host = "localhost",
    port = 3306,
    user = "root",
    password = "password",
    database = "mydb",
    connectionPool = {
        maxOpenConnections: 15,        // default: 15
        maxConnectionLifeTime: 1800.0, // seconds; default: 1800 (30 min)
        minIdleConnections: 5          // default: matches maxOpenConnections
    }
);
```

## Query and result errors

`sql:Error` hierarchy:

```
sql:Error
├── sql:DatabaseError         (has errorCode and sqlState fields)
├── sql:NoRowsError           (queryRow() returned no row)
├── sql:BatchExecuteError     (one or more batch commands failed; has executionResults)
└── sql:ApplicationError
    └── sql:DataError         (problem with parameters or result mapping)
        ├── sql:TypeMismatchError
        ├── sql:ConversionError
        ├── sql:FieldMismatchError
        └── sql:UnsupportedTypeError
```

To branch on the failure kind:

```ballerina
User|sql:Error result = dbClient->queryRow(`SELECT * FROM users WHERE id = ${userId}`);
if result is sql:NoRowsError {
    // No row matched — usually a normal flow, not an error
} else if result is sql:DatabaseError {
    string sqlState = result.detail().sqlState ?: "";
    int errorCode = result.detail().errorCode ?: 0;
    // map sqlState / errorCode to your domain error
}
```

### Common patterns

| Error                          | SQL state | Cause                                    | Fix                                                                  |
| ------------------------------ | --------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `{ballerina/sql}NoRowsError`   | —         | `queryRow()` matched zero rows           | Handle as a valid case in the union                                  |
| `Duplicate entry`              | `23000`   | Unique constraint violation on insert    | Check for duplicates first, or use `INSERT ... ON DUPLICATE KEY UPDATE` |
| `Table doesn't exist`          | `42S02`   | Wrong table name or migrations not run   | Verify the schema; run pending migrations                            |
| `Access denied`                | `28000`   | Wrong DB credentials                     | Verify user/password and grants                                      |
| `Communications link failure`  | —         | Network issue, DB down, firewall blocked | Test reachability with `telnet`/`nc`                                 |
| Pool exhausted                 | —         | All pool slots occupied                  | Increase `maxOpenConnections` or hunt for leaks (missing `close()`)  |
| `No suitable driver found`    | —         | Driver package not imported              | Add `import ballerinax/<vendor>.driver as _;`                        |

## Transactions

```ballerina
transaction {
    check dbClient->execute(`INSERT INTO orders VALUES (${id}, ${amount})`);
    check dbClient->execute(`UPDATE inventory SET stock = stock - 1 WHERE id = ${itemId}`);
    check commit;
} on fail var e {
    // Automatic rollback already happened; log e here
}
```

Things that bite in transactions:

- **Transaction never committed** — the function returned or raised before reaching `check commit`. Re-read the control flow.
- **Implicit rollback** — any error inside the `transaction` block triggers rollback. Inspect the `on fail` clause to see what actually failed.
- **Distributed transactions** — Ballerina's `transaction` is single-datasource by default. Spanning multiple databases requires explicit coordination (e.g., 2PC or saga patterns implemented in application code).

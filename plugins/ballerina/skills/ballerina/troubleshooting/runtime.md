# Runtime Issues

Runtime problems surface after compilation succeeds, while the program is executing. This file covers the **core runtime** — for connector-specific runtime failures, jump to the matching file (`http.md`, `sql.md`, …).

## Errors vs panics

Ballerina splits failures into two categories, and they are read differently.

|                | Error                                                            | Panic                                                                |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Nature         | Expected failure, returned as a value                            | Unrecoverable failure that terminates the strand                     |
| Triggered by   | `return error(...)`, `check` on failure, library function return | `panic`, nil dereference via unsafe cast, divide by zero, type cast  |
| Handled by     | `if x is error { ... }` or `do { ... } on fail var e { ... }`    | `trap` expression (use sparingly — usually a bug, not a flow)        |
| Stops program? | No                                                               | Yes, unless trapped                                                  |
| Stack trace?   | Optional, attached to the error value                            | Always printed to stderr                                             |

## Reading an error or panic

The standard format is:

```
error: <message>
    at <org>/<package>:<version>:<function>(<file>.bal:<line>)
    ...
```

A real example:

```
error: {ballerina/http}ClientRequestError Connection refused: localhost/127.0.0.1:8080
       └── origin ──┘ └── type ────────┘ └────── message ─────────────────────────┘
```

The `{org/module}` prefix identifies where the error came from:

| Prefix                | Origin                                |
| --------------------- | ------------------------------------- |
| `{ballerina}`         | Core runtime                          |
| `{ballerina/http}`    | `ballerina/http`                      |
| `{ballerina/sql}`     | `ballerina/sql`                       |
| `{ballerina/graphql}` | `ballerina/graphql`                   |
| `{ballerina/io}`      | `ballerina/io`                        |
| `{ballerinax/kafka}`  | `ballerinax/kafka` (extended library) |
| `{myorg/mypackage}`   | Your own package                      |

Ballerina stack traces may interleave Ballerina frames (`at myorg/mypackage:main(main.bal:15)`) with Java frames from the runtime. Focus on the Ballerina frames first — they tell you what your code was doing when it failed.

## Core runtime errors

These have the `{ballerina}` prefix and originate from the runtime itself.

| Error type                          | Meaning                                                                                                                                                                                                                                       | Typical cause                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `{ballerina}TypeCastError`          | Runtime type cast failed                                                                                                                                                                                                                      | `<MyType>value` where the value is not actually `MyType`     |
| `{ballerina}NullReferenceException` | A `()` value was used where a non-nil value was required. Not the same as a Java NPE — Ballerina's type system normally prevents this, so it appears mainly when a `()` slips past via an unsafe cast like `<string>nilValue`.               | Dereferencing nil via unsafe cast                            |
| `{ballerina}NumberConversionError`  | A numeric conversion failed                                                                                                                                                                                                                   | `check int:fromString("abc")`                                |
| `{ballerina}StackOverflow`          | Infinite recursion                                                                                                                                                                                                                            | Recursive function missing a base case                       |
| `{ballerina}IllegalStateException`  | Operation on a closed or invalid resource                                                                                                                                                                                                     | Using a client or channel after `close()`                    |
| `{ballerina}IndexOutOfRange`        | Array or tuple index out of bounds                                                                                                                                                                                                            | Reading past the end of an array or tuple                    |
| `{ballerina}KeyNotFound`            | Missing map key                                                                                                                                                                                                                               | Member access on a key that isn't present in a `map`         |
| `{ballerina}JSONOperationError`     | Invalid JSON access path                                                                                                                                                                                                                      | Reading a non-existent key or wrong type from a `json` value |

### Worked example — `TypeCastError`

```
error: {ballerina}TypeCastError {"message":"incompatible types: 'string' cannot be cast to 'int'"}
        at myorg/mypackage:0.1.0:processData(utils.bal:42)
        at myorg/mypackage:0.1.0:main(main.bal:10)
```

Look at `utils.bal:42` — it likely contains `<int>someValue` where `someValue` is sometimes a `string` at runtime. Trace where `someValue` is assigned and confirm the type holds on every path.

### What to do, by error type

| Error type               | Action                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `TypeCastError`          | Replace `<T>val` with `if val is T { ... }` or `value:ensureType(val)`                                              |
| `NullReferenceException` | Add nil checks; use `value:ensureType` or match against `()` before using                                           |
| `NumberConversionError`  | Validate input before conversion; handle the `error` return from `int:fromString`, `float:fromString`, etc.         |
| `StackOverflow`          | Audit recursive functions for base cases; switch to an iterative form if recursion isn't required                   |
| `IllegalStateException`  | Track resource lifecycle — don't reuse clients/channels after `close()`                                             |
| `IndexOutOfRange`        | Guard with `if i < arr.length()`; for safe extraction use `value:ensureType` on the result of optional access       |
| `KeyNotFound`            | Use `map.hasKey(key)` first, or use optional access (`map[key]` returns `()` on `map<T?>` for missing keys)         |
| `JSONOperationError`     | Use optional chaining (`j?.key`) and check shape before drilling into a nested `json`                               |

If the stack trace shows no frames from your code — every frame is in the runtime — the panic is a runtime bug rather than misuse. File against `ballerina-platform/ballerina-lang` with a minimal reproducer.

## Strand dumps — diagnosing hangs and deadlocks

When a program hangs, take a strand dump to see which strands are blocked and on what. The mechanism uses `SIGTRAP`, so it works on Linux and macOS but **not on Windows**.

Find the PID:

```bash
jps
# Look for: <PID> $_init   (a running service)
# or:       <PID> BTestMain (a test run)
```

Trigger the dump:

```bash
kill -SIGTRAP <PID>
# equivalent:
kill -5 <PID>
```

The dump goes to the program's **standard output**. If you want to capture it, run the program with `bal run . > out.log 2>&1`.

A dump entry looks like this:

```
Timestamp: 2024-03-15T10:30:00.000Z
Total strand groups: 4, active: 2

Strand Group: [ID=1, state=RUNNABLE, strands=2]
  Strand: [ID=1, name=main, state=RUNNABLE]
    at myorg/mypackage:processRequest(service.bal:42)
  Strand: [ID=2, state=WAITING FOR LOCK]
    at myorg/mypackage:updateCounter(utils.bal:15)
```

Strand states that matter:

| State                               | What it means                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `WAITING FOR LOCK`                  | Trying to enter a `lock` block — multiple strands here may indicate a deadlock                 |
| `BLOCKED ON WORKER MESSAGE SEND`    | Waiting for a peer worker to receive (`->`)                                                    |
| `BLOCKED ON WORKER MESSAGE RECEIVE` | Waiting for a peer worker to send (`<-`)                                                       |
| `BLOCKED`                           | Blocked on sleep or an external call (HTTP, DB, etc.)                                          |
| `RUNNABLE`                          | Running or ready to run                                                                        |
| `DONE`                              | Finished                                                                                       |

### Suspecting a deadlock

1. Take the dump. Count strands stuck in `WAITING FOR LOCK`.
2. Identify which `lock` blocks they're contending on, using the file:line in each frame.
3. Common fixes: shrink the scope of `lock` blocks, enforce a consistent lock acquisition order across call sites, or eliminate shared mutable state.
4. If strands are stuck on `BLOCKED ON WORKER MESSAGE SEND/RECEIVE`, verify worker send/receive pairs balance — every `->` needs a matching `<-`.

### Program hangs without deadlock

1. Look for `BLOCKED` strands. They're typically waiting on an external call.
2. Check whether the downstream service is responding (network, DNS, listener up).
3. Long-term fix: set timeouts on every external client so a slow dependency cannot stall a strand indefinitely.

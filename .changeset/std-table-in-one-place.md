---
'@kestack/auth-toolkit': patch
'@kestack/rpc-toolkit': patch
'@kestack/connect': patch
'@kestack/devtools': patch
---

Each StdTable is declared in one place, with its entities, for std-toolkit's new table declaration. A table set up by an earlier release has no Stored contract in the new form, so its first setup wipes a disposable one: `ke-connect` forgets its remembered sign-ins once, the websocket stream store drops pending resumes, and devtools drops its local telemetry.

- Breaking: a persistent table set up by an earlier release is refused until it moves to a new physical table name: Cloud Connect's `connections` D1 table (the deploy fails), the code Plugin's store on a Connection, and the devtools project registry.

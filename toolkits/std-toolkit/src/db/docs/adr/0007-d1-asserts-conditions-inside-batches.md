# D1 asserts SQLite conditions inside atomic batches

D1 is a driver beneath the existing SQLite adapter, using a caller-owned database binding and the same StdTable setup and layer. D1's batch API rolls back on SQL errors, but a conditional statement changing zero rows succeeds; checking affected rows after the batch returns would violate the StdTable atomic-write contract because the writes have already committed.

After each statement with an expected change count, the driver adds a SQL `CASE` assertion against `changes()`. The failing branch evaluates `json_extract` with an invalid path containing a unique statement marker: SQLite raises an error, D1 rolls back the batch, and the driver translates the marker into the existing `SQLiteChangesMismatch` with the original statement index. This deliberately relies on SQLite's JSON-path error retaining the invalid path; local D1 runtime tests verify both rollback and error translation. It avoids auxiliary tables, triggers, or changes to the shared SQLite driver contract. An unrecognized error remains an operation failure rather than being guessed to be a condition failure.

References: [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [SQLite JSON path errors](https://www.sqlite.org/json1.html#path_arguments).

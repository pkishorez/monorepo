# Buffered transactions and auto-versioned setup in the IndexedDB adapter

The IndexedDB adapter deliberately diverges from the SQLite adapter in two places, both forced by IndexedDB's lifecycle model rather than by preference.

## Transactions: buffered ops, no begin/commit/rollback

IndexedDB transactions auto-commit the moment control returns to the event loop with no pending IDB request, so a transaction cannot stay open across foreign async work (Effect boundaries, schema validation, network). An interactive `begin`/`commit`/`rollback` surface like `SqliteDB`'s is therefore impossible to implement honestly — it would either throw `TransactionInactiveError` at runtime or silently commit early.

Instead, `transact()` keeps the op-descriptor pattern (`insertOp`/`updateOp` validate and migrate _outside_ any transaction, producing plain descriptors), then applies all descriptors in **one native read-write IDB transaction** with no foreign awaits inside it. This gives real all-or-nothing atomicity. The same transaction is where updates re-check `_u` (optimistic concurrency across browser tabs), the analog of DynamoDB's `ConditionExpression`.

Rejected: sequential best-effort writes (API parity without the atomicity guarantee — callers would assume a guarantee that isn't there).

## Setup: the adapter owns the database version — and therefore the database name

IndexedDB only permits creating object stores and indexes inside a version-gated `upgrade` callback. To preserve the idempotent `setup()` UX of the SQLite adapter (call it any time, it converges), `setup()` opens the database at its current version, diffs the declared stores/indexes against what exists, and — only if something is missing — closes and reopens at `version + 1` to create it.

Upgrade requests are optimistic and topology is rechecked after every reopen. IndexedDB serializes version-change transactions across tabs, but two callers can still request the same next version; only the winner receives an `upgrade` callback. The loser therefore reopens at the winning version, observes that its own store or indexes are still missing, and retries from the newly observed version. A process-local lock is insufficient because it cannot coordinate browser tabs.

Consequence: a database name handed to `idbLayer` **belongs to the adapter**. No other code may open that database with its own version scheme, or the two version counters will fight. Apps that already manage an IndexedDB database must give this adapter a separate database name.

Rejected: user-managed `{ version, upgrade }` config (leaks IDB mechanics into an API whose siblings have none, and turns "add a GSI" into a manual app-side migration); fixed version 1 (no schema evolution path).

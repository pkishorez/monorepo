# Auto-versioned setup: the adapter owns the database version — and therefore the database name

(The buffered-transactions decision that used to live here is now kernel-wide: see [db ADR 0001](../../../docs/adr/0001-buffered-transact-ops-only.md).)

IndexedDB only permits creating object stores and indexes inside a version-gated `upgrade` callback. To preserve the idempotent `setup()` UX of the SQLite adapter (call it any time, it converges), `setup()` opens the database at its current version, diffs the declared stores/indexes against what exists, and — only if something is missing — closes and reopens at `version + 1` to create it.

Upgrade requests are optimistic and topology is rechecked after every reopen. IndexedDB serializes version-change transactions across tabs, but two callers can still request the same next version; only the winner receives an `upgrade` callback. The loser therefore reopens at the winning version, observes that its own store or indexes are still missing, and retries from the newly observed version. A process-local lock is insufficient because it cannot coordinate browser tabs.

Consequence: a database name handed to `idbLayer` **belongs to the adapter**. No other code may open that database with its own version scheme, or the two version counters will fight. Apps that already manage an IndexedDB database must give this adapter a separate database name.

Rejected: user-managed `{ version, upgrade }` config (leaks IDB mechanics into an API whose siblings have none, and turns "add a GSI" into a manual app-side migration); fixed version 1 (no schema evolution path).

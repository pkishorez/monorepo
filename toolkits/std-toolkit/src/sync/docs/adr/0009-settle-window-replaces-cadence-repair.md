---
status: accepted
---

# A Settle Window replaces Cadence Repair

A Backend can make a write readable after a forward cursor has already moved
past its `_u`; that write is then skipped forever. Cadence Repair fixed this
with a second worker that rechecked "suspect" Entities using the `_s` (server
observation) and `_c` (client receipt) meta fields. It is replaced by a
Collection-level Settle Window: a strategy re-reads the last window each time
it reads forward and never saves progress past `newest _u read − window`. Duplicates are
no-ops under the Convergence Rule, so the cost is a small overlap per read
rather than a second sync. The window is measured from the newest `_u` read,
not the device clock, so client clock skew cannot defeat it.

The engine cannot see inside a strategy's opaque Sync State, so every run
receives a `settledCursor(batch)` helper; the built-in strategies use it.

The Settle Window is off by default: Backends that push through `subscribe`
(for example a Durable Object) deliver in order and need no re-read.

## Consequences

- `_s` and `_c` leave [[core]] Entity meta; nothing else interprets them.
- A custom strategy that ignores `settledCursor` does not get the protection.

---
'std-toolkit': patch
---

Transact ops now carry intent only; `transact` performs the reads at commit time.

`getAndUpdateOp`, `deleteOp`, `restoreOp`, and `getAndCheckOp` no longer read when you build them, so the interval between building an op and committing it cannot make it stale. `transact` reads the current items consistently and concurrently, applies each op to what it read, and submits.

Breaking changes:

- An update callback can no longer return `null`. A rule that declines the write is an entity invariant, passed as the `check` option beside `lastWriteWins` and evaluated against the value `transact` reads. `UpdateRefused` is removed; a refusal is `CheckRefused`.
- `TransactOutcome.status` replaces `failed` with `stale`, `refused`, and `missing`, so a caller can tell a retryable conflict from a broken invariant or a wrong key.
- `NoItemToUpdate`, `NoItemToCheck`, and `ItemAlreadyExists` now surface from `transact` rather than from the op constructor.
- `check` and `lastWriteWins` are mutually exclusive; the types reject the pair, because only the `_u` condition holds the value the invariant judged.
- `StdTableContract.getItem` takes an optional `{ consistent }`.

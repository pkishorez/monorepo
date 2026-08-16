---
'std-toolkit': patch
---

Add transaction check ops and report the outcome of every operation.

`transact` gains a fifth op kind: checks that assert without writing —
`entity.unchangedOp(entity)`, `entity.existsOp(key)`, and
`entity.notExistsOp(key)`, with single entities getting `unchangedOp` only.
Checks share the ops array, the 100-item limit, and the duplicate-target guard,
and yield `null` at their position so results stay one-to-one with the ops given.

**Breaking:** a failed transaction now fails with `TransactFailed`, carrying one
`TransactOutcome` per submitted op — its status, and the condition kind when
refused — instead of a bare `ConditionFailed` naming a single entity. Statuses
of ops that did not themselves fail remain adapter-specific: DynamoDB evaluates
every item, while the other adapters abort at the first refusal.

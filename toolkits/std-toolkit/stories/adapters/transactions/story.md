# Transactions

Save several changes as one: they all land, or none of them do.

Moving a task between boards is an insert on one board and a delete on the other. If only one lands, the task is lost or doubled.

You prepare each change, then hand them to the table together:

```ts
yield *
  table.transact([
    yield * task.insertOp({ ...moved, boardId: 'home' }),
    yield * task.deleteOp({ boardId: 'work', taskId: 't1' }),
  ]);
```

[Moving a task between boards becomes one change](std-toolkit/adapters/transactions/moving-a-task-between-boards-is-one-change), with one update stamp. [If any write is refused, nothing is written](std-toolkit/adapters/transactions/a-batch-lands-whole-or-not-at-all), and you are told which one refused. [A batch can also depend on another row](std-toolkit/adapters/transactions/a-batch-can-depend-on-another-row) without changing it, and [when it is refused, a guard that never held is not reported as passed](std-toolkit/adapters/transactions/a-refused-batch-reports-guards-honestly).

[A batch DynamoDB would refuse fails on every database](std-toolkit/adapters/transactions/a-batch-dynamodb-would-refuse-fails-everywhere), so code that works in your tests works in production.

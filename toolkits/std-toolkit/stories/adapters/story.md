# Adapters

Keep all your entities in one table and put that table on DynamoDB, SQLite, IndexedDB, or memory.

Your server runs on DynamoDB, your tests in memory, your phone app on SQLite. Writing the data layer once for each is the work you want to skip.

You define the table once, and choose where it lives when you run your code:

```ts
program.pipe(Effect.provide(SQLite.make(table, { database }).layer));
```

[The same code gives the same answers on memory and SQLite](std-toolkit/adapters/the-same-code-runs-on-memory-and-sqlite). [Many kinds of entity share one table without mixing](std-toolkit/adapters/many-kinds-share-one-table-without-mixing), and [a scan sees every stored row](std-toolkit/adapters/a-scan-sees-every-stored-row) when you need them all.

Every table keeps to what DynamoDB can hold, so the most limited database decides what is allowed and the rest follow. [A table DynamoDB could not hold is refused](std-toolkit/adapters/a-table-dynamodb-could-not-hold-is-refused) when you define it, and so is [an index the table does not have](std-toolkit/adapters/an-index-the-table-lacks-is-refused), before any data exists.

When several changes must land together, like moving a task between boards, you save them as one [transaction](std-toolkit/adapters/transactions).

# Database

Part two of three.

Part one gave the Note a shape that can change. This part gives it somewhere to
live — and the somewhere is deliberately unremarkable: **one table, with a
partition key and a sort key**, and everything the notebook needs expressed as
keys inside it.

The point of that constraint is portability. The same table shape runs on
DynamoDB, IndexedDB, SQLite, and an in-memory adapter, and every proof in this
part runs on all four at once and asserts they agree. When a Story says a query
returns three notes, it returned three notes four times.

Start with **How these stories run** to see the harness, then **Building the
notebook**, which assembles the table every later Story uses — and ends by
proving that it did.

# Database

This is part two of three.

Part one gave the note a shape. This part gives the note a place to stay.

The place is one table. The table has a partition key and a sort key. Nothing
else. Everything that the notebook must do is expressed as keys in that table.

The limit has a purpose. The same table shape runs on DynamoDB, on IndexedDB, on
SQLite, and on an in-memory adapter. Each proof in this part runs on all four at
the same time. Each proof then asserts that the four results agree. When a Story
says that a query returned three notes, the query returned three notes four
times.

Start with **How these stories run** to see the harness. Then read **Building
the notebook**. Those Stories build the table that each later Story uses. The
last one proves that they built it.

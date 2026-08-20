# How these stories run

Four databases, one program.

Every proof in this part is written once and run four times — against DynamoDB
Local over HTTP, IndexedDB, an in-memory SQLite database, and the Memory
adapter — and then asserted to have produced the same answer on all four.

That is what `parity` and `agree` do in the setup block of every Story here. A
proof that passes has demonstrated portability, not just correctness.

These Stories cover the harness itself: what runs, how each proof gets a clean
database, how a program picks its adapter, and the one table shape they share.

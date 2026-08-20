# Table limits & failures

The shapes, keys, queries, and batches that a table refuses.

These Stories are together because they share one property. Each refusal happens
before anything is written.

- A table that cannot be addressed does not build.
- A key part that cannot be encoded does not build.
- A query with two sort conditions does not run.
- A batch that touches one note two times does not commit.

The last Story is different. It is about a row that is already in storage and
cannot be decoded. It fails at that row. It does not return a value that it
guessed.

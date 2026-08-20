# Table limits & failures

The shapes, keys, queries, and batches a table refuses.

Grouped here rather than along the path because they share one property: each is
a refusal that happens _before_ anything is written. A table that cannot be
addressed does not build. A key component that cannot be encoded does not build.
A query with two sort conditions does not run. A batch touching one row twice
does not commit.

The last Story is the exception — a row already in storage that cannot be
decoded — and it fails at the row that holds it rather than handing back a
half-guessed value.

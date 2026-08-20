# Binding entities

A table holds rows. An entity says which rows are yours.

Binding a Note to the table answers two questions: which of its fields decide
the partition a note lands in, and which decide the row inside that partition.
That is the whole of single-table design — the keys are the schema.

These Stories also cover the two neighbours of a keyed entity: an entity with
exactly one row, and what happens when two entities share one table.

# Optimistic transactions

Two collections, one change.

Some edits are not about one note. When a change spans two collections, both are
mutated in one ambient transaction: both live queries update immediately, and a
single backend transaction persists and confirms them together.

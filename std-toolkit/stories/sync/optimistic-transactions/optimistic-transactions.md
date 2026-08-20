# Optimistic transactions

Two collections, one change.

Some edits are not about one note. When a change covers two collections, both
change inside one transaction. Both live queries update at once. One backend
transaction then saves and confirms them together.

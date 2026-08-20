# Transactions

Several writes that land together, or not at all.

Each write is built as an _op_ and the whole list is handed to `transact`. The
important property is that an op carries intent, not a snapshot: the row is read
at commit time, so the gap between building an op and committing it cannot make
it stale.

On top of that sit the two ways to make a batch refuse itself — asserting a note
has not moved, and attaching an invariant that is evaluated against what the
commit actually read.

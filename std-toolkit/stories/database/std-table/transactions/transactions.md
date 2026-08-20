# Transactions

Several writes that land together, or not at all.

Each write is built as an op. The list of ops goes to `transact`.

An op carries intent. It does not carry a copy of the row. `transact` reads the
row at the time it commits. The time between building an op and committing it
therefore cannot make the op wrong.

Two more operations can stop a batch. One asserts that a note has not changed.
The other applies a condition to the value that the commit reads.

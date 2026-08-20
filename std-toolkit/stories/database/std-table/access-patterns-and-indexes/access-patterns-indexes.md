# Access patterns & indexes

The same table, asked a different question.

A secondary index is a second set of keys over the same rows. To use it, name it
in the query instead of `primary`. That is the whole interface.

The edge is worth knowing. A note that cannot make a key for an index stays out
of that index. The index is sparse. The note is still stored. Each other way of
reading the note still works.

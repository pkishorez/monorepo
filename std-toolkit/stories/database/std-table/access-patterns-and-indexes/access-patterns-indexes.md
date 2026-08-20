# Access patterns & indexes

The same table, asked a different question.

A secondary index is a second set of keys over the same rows. Naming it instead
of `primary` in a query is the whole of the API.

What is worth knowing is the edge: a note that cannot form a key for an index is
simply left out of it. The index is sparse, the note stays stored, and every
other way of reading it still works.

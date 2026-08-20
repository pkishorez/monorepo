# Querying

Reading a notebook rather than a note.

A query names an access pattern and one sort condition. The condition is how you
say which slice of the partition you want — all of it, everything after a point,
everything between two points, or everything starting with a prefix.

Prefix matching is the one worth dwelling on: it is how a hierarchy stored in a
sort key gets read one level at a time.

# Querying

Read a notebook, not one note.

A query names an access pattern and one sort condition. The condition selects
the part of the partition that you want. You can select all of it. You can
select everything after a point. You can select everything between two points.
You can select everything that starts with a prefix.

The prefix is the most useful. A sort key can hold a path. A prefix then reads
one level of that path and leaves the rest.

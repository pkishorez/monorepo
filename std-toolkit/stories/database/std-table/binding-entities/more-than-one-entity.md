# More than one entity

A notebook holds more than notes.

It also holds settings — one row, always present, that a reader should never
have to check for null. That is a _single entity_: it declares a default and
returns it before anything has ever been written to it.

And once two entities share one table, the obvious worry is collision. The
second Story here settles it: every key is prefixed with the entity it belongs
to, so two entities keyed on the same value occupy separate partitions and
neither query ever sees the other's rows.

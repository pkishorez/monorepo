# More than one entity

A notebook keeps more than notes.

It also keeps settings. There is one settings row and it is always there. A
reader must never test it for null. This is a single entity. It declares a
default value and returns that value before anyone writes to it.

When two entities share one table, they can collide. The second Story shows that
they do not. Each key carries the name of its entity. Two entities with the same
key value stay in separate partitions. Neither query sees the rows of the other.

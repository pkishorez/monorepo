# Entities have identity

An entity is an object that something else refers to.

A note is stored under a key and referenced by that key from everywhere else in
the notebook. So one field is named as its identity, and the ladder is not
allowed to touch it: no rung may rename, drop, or retype the id field, and it is
added to every version automatically.

That restriction is the whole feature. It is what lets a note migrate across
four versions and still be the same note afterwards.

# Updating safely

Changing part of a note without reading the whole thing first.

`getAndUpdate` takes a key and only the fields that change. The rest keep their
values and the update stamp moves forward.

Two guard rails come with it: an update can carry an invariant that refuses it
before anything is written, and a note's key is immutable — a note moves only by
being written under a new key and deleted from the old one.

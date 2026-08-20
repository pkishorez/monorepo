# Values, not objects

Some data in a notebook is not an object.

The status of a note is one word. The theme is one word. The number of notes on
a page is one number.

These values change version in the same way that objects do. But a bare value
has no space for a version stamp. Storage therefore puts the value in an
envelope: `{ _v, value }`.

The envelope explains the Stories in this group. It shows how a stored value
finds its version. It shows what occurs with values that were written before
this system. And it shows the one shape that causes a conflict: a value that
contains a `_v` of its own.

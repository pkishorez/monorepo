# Values, not objects

Not everything in a notebook is an object.

A note's status is one word. The theme is one word. Notes-per-page is one
number. These evolve on exactly the same ladder objects do — but a bare `"done"`
has nowhere to keep a version stamp, so storage wraps it: `{ _v, value }`.

That envelope explains most of what follows: how a stored value finds its
starting rung, what happens to values written before any of this existed, and
the one shape — a value that already has a `_v` of its own — that collides with
it.

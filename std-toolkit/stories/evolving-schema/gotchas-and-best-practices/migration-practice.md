# Migration practice

Habits that keep a schema safe to use years later.

There are three rules.

**Add, do not change.** A step that has shipped is history.

**Be complete.** A migration must accept each value that the old version
allowed.

**Be pure.** The same bytes must decode to the same value on each read, on each
replica, and on each day.

There is also `makePartial`. It checks nothing. Know that, because it looks like
it checks something.

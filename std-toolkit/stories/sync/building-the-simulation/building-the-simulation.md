# Building the simulation

These four Stories add one term each.

There is no server here and no real browser. A simulator supplies both. A Story
can therefore open two tabs, disconnect one, hide the other, and assert what
each one shows. The result is the same on each run, and it takes milliseconds.

1. **A backend, and nobody watching.** A server that holds notes. Nothing
   observes it. A write notifies no one.
2. **A browser mounts a query.** A browser, a collection, and a live query. A
   note reaches a screen for the first time. `shows` and `eventuallyShows` start
   here.
3. **Two browsers, one backend.** A second person, a second copy of the data,
   and what occurs when one of them goes offline.
4. **The vocabulary we built.** This is the handover. Its questions assert that
   the table and the note built here are the ones that `support.ts` exports.

Each later Story uses this vocabulary:

- `backend.insert/update/remove('Note', ...)`
- `browser('alice').mount({ name, query })` and `.unmount(liveQuery)`
- `browser('alice').tab('second')` for a second tab with its own copy
- `browser('alice').disconnect` and `.reconnect`
- `browser('alice').hide/show/freeze/resume/close`
- `liveQuery.shows(rows)` and `.eventuallyShows(rows)`

The simulator is in `stories/sync/simulation/`. You do not have to read it.
These Stories are written on the assumption that you will not.

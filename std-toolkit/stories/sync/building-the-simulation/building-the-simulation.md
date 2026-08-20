# Building the simulation

Four Stories, each adding one term.

There is no server here and no real browser. A simulator stands in for both, so
a Story can open two tabs, disconnect one, hide the other, and assert exactly
what each of them shows — deterministically, in milliseconds.

This group builds that world in the open, one piece per Story:

1. **A backend, and nobody watching** — a server with notes on it. Nothing
   observes it yet, and a write notifies no one.
2. **A browser mounts a query** — a Browser, a Collection, and a Live Query.
   This is where a note first reaches a screen, and where `shows` and
   `eventuallyShows` come from.
3. **Two browsers, one backend** — a second person, a second copy of the data,
   and what happens when one of them goes offline.
4. **The vocabulary we built** — the handoff. Its questions assert that the
   table and Note assembled here are the ones `support.ts` exports, and that
   `Simulation` is the whole door.

The full vocabulary every later Story is written in:

- `backend.insert/update/remove('Note', ...)`
- `browser('alice').mount({ name, query })` and `.unmount(liveQuery)`
- `browser('alice').tab('second')` for a second tab with its own replica
- `browser('alice').disconnect` and `.reconnect`
- `browser('alice').hide/show/freeze/resume/close`
- `liveQuery.shows(rows)` and `.eventuallyShows(rows)`

The simulator behind that door lives in `stories/sync/simulation/`. You do not
need to read it, and these Stories are written on the assumption you will not.

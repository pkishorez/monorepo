# How these stories run

One backend, any number of browsers, in one process.

There is no server and no real browser here. A simulator stands in for both, so
a Story can open two tabs, disconnect one, hide the other, and assert exactly
what each of them shows — deterministically, in milliseconds.

The vocabulary every Story in this part is written in:

- `backend.insert/update/remove('Todo', ...)`
- `browser('alice').mount({ name, query })` and `.unmount(liveQuery)`
- `browser('alice').tab('second')` for a second tab with its own replica
- `browser('alice').disconnect` and `.reconnect`
- `liveQuery.shows(rows)` and `.eventuallyShows(rows)`

The simulator itself lives behind `stories/sync/simulation/`. You do not need to
read it, and these Stories are written on the assumption that you will not.

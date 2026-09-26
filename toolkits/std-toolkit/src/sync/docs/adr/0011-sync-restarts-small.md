---
status: accepted
---

# Sync restarts small

Sync had grown to about 8k lines, and its real users (the devtools and the kai
playground) used a Global Sync strategy and nothing else. Sync is rebuilt
around keyed Collections, Global and Partition Sync, strategies that pull or
are pushed, a Settle Window, and two Platforms (Memory and browser).

Left out until they are needed again, each as its own layer rather than woven
into the core:

- **Outbox and Offline Actions** — writes call Mutation Callbacks directly and
  roll back on failure. ADR-0005 remains the plan when they return.
- **Single-item Collections** — to return as a keyed Collection with one fixed
  key, not a second code path.
- **Reset** — logout is `dispose()` followed by deleting the Std Sync's stored
  data (`deleteStdSync` in the browser Platform).
- **Registry Broadcast, flow tracing, the Ready Gate, the store `version`, and
  pausing while offline.**
- **Expo and Node Platforms** — the Platform contract is public, so they are
  new presets, not core changes.

The folders keep ADR-0007's idea, layered by the zoom levels of the new story,
each knowing only the ones below: `std-sync` (the instance) → `collection`
(one TanStack DB Collection, its replica, state, Partitions, and writes) →
`session` (one strategy under Leadership) → `strategy` (the shape and the
built-ins) and `platform` (contract, Memory, browser) → `domain` (the words).
`paced` stands alone.

Stored data is never deleted automatically; the browser Platform exposes
`listStdSyncs` and `deleteStdSync` for the application to manage it.

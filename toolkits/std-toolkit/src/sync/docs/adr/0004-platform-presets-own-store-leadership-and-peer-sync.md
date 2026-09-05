---
status: accepted
---

# Platform presets own store, Leadership, and Peer Sync

`createStdSync` no longer accepts `storeLayer`, `leadershipLayer`, or `peerSync` as independent options. One `platform` option resolves all three, and Peer Sync flips from on-by-default to off unless the platform opts in.

## Context

The three knobs are independent axes inside the library, and tests exercise every combination. But applications only ever want two rows of that matrix: a solo participant on an ephemeral store, or same-origin browser tabs sharing an IndexedDB Sync Store with Web Locks Leadership and Peer Sync together. The other combinations are traps:

- Peer Sync between participants that do not share a Backend injects Entities into replicas whose own Backend never confirmed them.
- Leadership without Peer Sync freezes dormant participants; nothing else updates them.
- Leadership over isolated Memory Sync Stores makes takeover re-fetch from the new leader's stale Sync State cursor, because Peer Messages carry Entities, never Sync State.

ADR 0002 documented the last constraint as accepted. This decision stops accepting it.

## Decision

`StdSyncDefaults.platform` is a plain value: `{ storeLayer?, leadershipLayer?, peerSync? }`. The core hands a platform nothing — an adapter takes what it needs as its own options, and instances may share one platform store because every stored record, lock, and Peer Channel is keyed by its qualified Collection Name. Absent platform means a solo participant: isolated Memory Sync Store, pass-through Leadership, no Peer Channel.

`browser()` is the only shipped preset: an IndexedDB Sync Store in database `std-sync` (overridable), Web Locks Leadership, and Peer Sync over BroadcastChannel. It lives at the `std-toolkit/sync/platform/browser` subpath so bundlers only carry the environments an app names, and future presets (`mobile()`, `node()`) arrive as sibling subpaths. Browser-only adapters — Web Locks Leadership and the BroadcastChannel Peer Channel factory — live inside that module rather than in the sync runtime: the runtime keeps only the ports, and the core ships no default transport at all. The raw function form remains the escape hatch for tests, stories, and custom transports.

## Consequences

Peer Sync is now opt-in, completing ADR 0002's "no silent fallback" stance — it was the remaining default-on coordination path. Consumers of the removed options must move to `platform`; the package is pre-1.0 and ships this as a normal release. Stories that simulate browsers assemble the raw parts directly.

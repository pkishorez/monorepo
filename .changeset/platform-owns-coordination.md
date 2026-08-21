---
'std-toolkit': patch
---

`createStdSync` takes one `platform` option instead of `storeLayer`, `leadershipLayer`, and `peerSync`.

A platform names the environment a Std Sync instance runs in — where the Sync Store lives and how concurrent participants coordinate. `platform: browser()` (from `std-toolkit/sync/platform/browser`) is the shipped preset: an IndexedDB Sync Store in database `std-sync` (overridable via `databaseName`), Web Locks Leadership, and Peer Sync over BroadcastChannel. A platform is a plain value and may be shared between instances — everything it provides is consumed per qualified Collection Name. Omitting `platform` means a solo participant: an isolated Memory Sync Store, no Leadership, no Peer Sync.

Breaking changes:

- `storeLayer`, `leadershipLayer`, and `peerSync` are removed from `StdSyncDefaults`. Pass a `platform` value `{ storeLayer?, leadershipLayer?, peerSync? }` for custom wiring.
- Peer Sync is now opt-in and the core ships no default transport. It was previously on by default whenever `BroadcastChannel` existed, which let participants that do not share a Backend inject entities into each other's replicas. A platform enables it with `peerSync: { channel }`; the BroadcastChannel factory is exported as `broadcastChannel` from `std-toolkit/sync/platform/browser`.
- Web Locks Leadership moved into the browser platform module; the `std-toolkit/sync/leadership/web-locks` subpath export is removed. Import `browser()` instead, or reach the raw pieces via `std-toolkit/sync/platform/browser`.

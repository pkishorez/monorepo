# Sync Replica and Peer Sync Refactor

## Goal

Refactor `std-toolkit`'s TanStack DB sync package into a named `sync` context with clear storage terminology and a best-effort cross-tab fast path. Confirmed entities must reach peer tabs immediately whether each tab uses Memory or IndexedDB. Backend polling or push remains the correctness mechanism.

The finished API and domain language use:

- `Sync` instead of `TanStack Sync`
- `Sync Replica` instead of `Source of Truth`
- `Sync Store` instead of `Sync Persistence Table` or cache
- `applyToSyncReplica` instead of `writeServerTruth` or `writeUpsert`
- `peerSync` for cross-tab fast-path configuration

Sync remains specifically integrated with TanStack DB. Do not introduce a generic frontend adapter abstraction.

## How to Execute This Plan

Work through the tasks below in order. Do not combine task commits.

For every task:

1. Read this file and `progress.md` before changing code.
2. Inspect `git status` and preserve unrelated user changes.
3. Implement only the task's stated scope.
4. Add or update focused tests alongside the change.
5. Run the task's checks and fix failures caused by the task.
6. Update `progress.md` with status, checks, decisions, and useful discoveries.
7. Review the diff and stage only files belonging to the task.
8. Create the specified conventional commit. Record its hash in `progress.md` in the following task's commit.

Do not rewrite existing commits, use destructive Git commands, or add compatibility aliases unless this plan explicitly asks for them.

Before writing or changing Effect code, read `node_modules/effect/AGENTS.md` completely and follow every required link. If that file is absent, stop before source changes and record the blocker in `progress.md`. Do not guess at replacement Effect conventions.

## Non-Negotiable Behavior

- `createStdSync` requires a stable `name`.
- Names are normalized by Unicode decomposition, removal of combining marks, lowercasing, replacing each run outside `a-z` and `0-9` with `-`, and trimming separators.
- Normalization fails only when the result is empty.
- Inputs that normalize to the same name in one namespace are duplicates and must fail.
- A qualified Collection Name is `<std-sync-name>.<schema-name>`, for example `acme-production.todo-items`.
- The original schema name remains the backend Entity `_e` identity.
- Readable Sync Addresses use forms such as `a`, `a.b`, `a.b{global}`, `a.b{x=hello-world}`, and `a.b{x=hello-world}.old-to-new`.
- Sync Addresses are display-only. Never parse them or use them as exact partition identity. Preserve the existing typed partition identity separately.
- The Sync Store contains the Sync Replica and Sync State. Memory versus IndexedDB controls durability, not peer delivery.
- Every Collection owns one Peer Channel named with its qualified Collection Name.
- A Collection subscribes when registered and unsubscribes only when its owning Std Sync is disposed. Projection mounting does not control peer subscription.
- Only entities accepted by local convergence are broadcast. This includes accepted tombstones.
- Peer receivers apply entities through the same convergence rule with propagation disabled. Never relay a peer delivery.
- Optimistic and `persist: false` values are never sent to peers.
- Peer delivery is best effort. Send, receive, decode, and channel failures are reported as structured events but never fail sync or mutation work.
- Backend pull, polling, or push remains responsible for eventual repair and correctness.
- Registry Broadcast and Peer Sync are separate concepts and code paths.
- No migration or compatibility layer is required for old package paths or durable identifiers; the package is currently `0.0.2`.

## Target Module Structure

Keep the existing dependency direction:

```text
domain -> persistence -> runtime -> workers -> lifecycle -> composition -> public
```

The renamed context lives under `std-toolkit/src/sync`.

Add or replace these deep modules:

```text
src/sync/
  index.ts
  sync.ts
  domain/
    sync-address/
      index.ts
      sync-address.ts
  persistence/
    sync-replica/              # replaces source-of-truth
    sync-state/
    sync-store/                # replaces sync-persistence-table
  runtime/
    peer-sync/                 # replaces change-notice
      index.ts
      peer-sync.ts             # public door and orchestration
      peer-message.ts          # private schema/envelope
      broadcast-channel.ts     # private browser adapter
```

Every folder module must follow the repository's deep-module convention: a narrow `index.ts`, a matching implementation file, and private supporting files that are not re-exported unnecessarily. Update `std-toolkit/laymos.config.json` so all layers and module declarations use `sync.*` and `src/sync`.

## Peer Sync Contract

The public configuration is Std-Sync-wide:

```ts
peerSync: false;
peerSync: {
  channel: customPeerChannelFactory;
}
```

Peer Sync is enabled by default when the platform supports a channel. There is no per-collection switch.

The raw public transport contract must expose behavior, not browser event properties:

```ts
interface PeerChannel {
  broadcast(message: unknown): Promise<void> | Effect.Effect<void, unknown>
  subscribe(handler: (message: unknown) => void): Promise<() => Promise<void>> | Effect.Effect<...>
}
```

Use the repository's established Effect style to settle the exact signatures. The subscription returns an asynchronous unsubscribe operation. Unsubscribe must stop admission of new messages and drain deliveries already admitted before it completes. Do not expose mutable `onmessage` state.

Each Collection derives a schema for this versioned envelope:

```ts
{
  version: 1,
  entities: Entity[] // non-empty
}
```

The schema validates the complete envelope, Entity Meta, collection value schema, and exact backend `_e`. Invalid messages are reported and ignored.

`PeerSync` owns:

- schema encode/decode
- broadcasting locally accepted entities
- serialized inbound application
- disabling propagation during inbound application
- channel subscription and cleanup
- non-fatal structured failure reporting

The default `BroadcastChannel` adapter stays private. Only `PeerChannel` and `PeerChannelFactory` customization types belong in the public API.

## Task Breakdown

### Task 1: Establish the `sync` Context and Package Paths

Rename `std-toolkit/src/tanstack-sync` to `std-toolkit/src/sync` and update imports, test paths, stories, package exports, and Laymos configuration. Rename the public implementation file from `tanstack-sync.ts` to `sync.ts` while retaining the factory name `createStdSync`.

Remove `std-toolkit/tanstack-sync` and `std-toolkit/tanstack-sync/paced`; add `std-toolkit/sync` and `std-toolkit/sync/paced`. Do not retain deprecated aliases. Update telemetry labels and other identifiers that describe this context.

Completion criteria:

- No source, config, story, or package export uses the old context path or `tanstack-sync.*` Laymos layer names.
- Public imports resolve through `std-toolkit/sync` and `std-toolkit/sync/paced`.
- Laymos reports no new violations.
- Type checking and existing sync tests pass.

Commit: `refactor(sync): rename tanstack sync context`

### Task 2: Add Names, Qualified Collection Names, and Sync Addresses

Implement the pure `domain/sync-address` module. Require `name` in `createStdSync`, normalize it once, and qualify every registered Collection Name. Detect duplicate normalized collection names within the Std Sync.

Use qualified Collection Names for local engine namespaces, store namespaces, peer channels, and observability. Continue using the schema's original name for Entity `_e` validation and backend communication. Keep exact typed partition keys for storage and maps; generated Sync Addresses are labels only.

Add focused tests for accents, punctuation, whitespace, case folding, empty results, normalization collisions, qualified names, address examples, and distinct typed partition values that share a display form.

Completion criteria:

- `createStdSync` cannot be constructed without a name at the type level.
- All intended namespaces include the normalized Std Sync and Collection names.
- Lossy display normalization cannot merge exact partition identities.
- Focused tests and package type checking pass.

Commit: `feat(sync): namespace sync instances and collections`

### Task 3: Rename Persistence Concepts and APIs

Rename `source-of-truth` to `sync-replica` and `sync-persistence-table` to `sync-store`. Rename associated services, types, errors, schemas, stored entity names, default store names, variables, logs, and comments. Rename `persistenceLayer` to `storeLayer`.

Replace `writeServerTruth` and public `utils.writeUpsert` with `applyToSyncReplica`. Update strategies, cadence repair, mutations, manual writes, registry persistence, keyed sync, and single-item sync to use the new operation.

Change the replica writer's accepted result so it contains every complete accepted Entity, including tombstones. A stale valid entity remains a successful no-op and must not appear in the accepted result.

Completion criteria:

- Runtime code and public types no longer use Source of Truth, SoT, Sync Persistence Table, `writeServerTruth`, `writeUpsert`, or `persistenceLayer` terminology.
- `applyToSyncReplica` is the single convergence entry point for backend-confirmed entities.
- Accepted results preserve complete upsert and tombstone entities.
- Persistence, convergence, strategy, keyed, and single-item tests pass.

Commit: `refactor(sync): adopt sync replica and sync store`

### Task 4: Build the Peer Sync Deep Module

Replace the change-notice module with `runtime/peer-sync`. Implement the public channel contract, collection-specific message schema, private default BroadcastChannel adapter, serialized delivery, and draining unsubscribe behavior.

The module must be testable without browser globals through a custom in-process `PeerChannelFactory`. Channel absence and all channel failures must degrade safely and report structured Sync Events.

Add unit tests for:

- valid envelope encode/decode
- non-empty entities
- invalid versions, values, metadata, and `_e`
- custom channel creation and cleanup
- ordered/serialized inbound delivery
- unsubscribe draining admitted work
- unavailable browser channels
- non-fatal send, receive, decode, and cleanup failures

Completion criteria:

- `runtime/change-notice` is gone.
- The peer module exposes only the intended customization contract and orchestrator.
- The default browser adapter is private.
- Peer unit tests, type checking, and Laymos pass.

Commit: `feat(sync): add peer sync transport`

### Task 5: Integrate Peer Sync with Replica Convergence

Create one Peer Sync instance per registered Collection. Subscribe at Collection registration and keep it alive independently of TanStack Collection Projection mounting. Dispose it with the owning Std Sync.

After a local `applyToSyncReplica`, project the accepted result locally and best-effort broadcast only the complete accepted entities. On peer receipt, apply through replica convergence with propagation disabled, then advance the receiver's projection if mounted. Advancing must still occur when a shared IndexedDB store makes convergence a no-op, because another tab may have written the replica before the message arrived.

Expose `peerSync` on `createStdSync`, enabled by default, with `false` and custom-channel options. Apply the behavior consistently to keyed and single-item sync.

Add integration tests using independent simulated tabs for:

- independent Memory stores receiving immediate peer updates
- shared IndexedDB stores
- accepted entities only
- tombstones
- stale and duplicate inputs
- no peer relay
- unmounted projection followed by later mount
- `peerSync: false`
- custom channels
- peer failure not failing mutation or sync
- backend polling repairing a missed peer delivery

Do not reuse one Memory layer between simulated tabs in the Memory test; each tab must own a separate store.

Completion criteria:

- Memory and IndexedDB tabs share confirmed changes through the same peer behavior.
- Optimistic and `persist: false` state remains tab-local.
- Peer delivery never becomes a correctness dependency.
- Integration tests, all existing sync tests, type checking, and Laymos pass.

Commit: `feat(sync): propagate confirmed entities to peers`

### Task 6: Finish Events, Documentation, and Stories

Update structured Sync Events, span names, logs, registry language, flow labels, READMEs, context maps, and examples. Add an ADR explaining:

- why Peer Sync carries confirmed entities instead of change notices
- why one channel belongs to each qualified Collection
- why Peer Sync is freshness-only and backend sync remains authoritative
- why Sync Addresses are not storage identities
- why no migration aliases are provided

Finish the existing `CONTEXT.md` terminology update and move it with the renamed context. Add or revise stories that demonstrate:

- two Memory-backed tabs converge immediately through Peer Sync
- polling alone has bounded delay, while Peer Sync provides the fast path
- a missed peer message is repaired by the backend
- IndexedDB durability and peer freshness are independent choices
- disabling Peer Sync preserves eventual backend convergence

Completion criteria:

- User-facing docs consistently use the settled language.
- Stories explain the mental model without presenting Peer Sync as authoritative.
- All stories execute successfully.
- Documentation links and package examples use `std-toolkit/sync`.

Commit: `docs(sync): explain replica and peer sync model`

### Task 7: Final Verification and Cleanup

Search for stale paths and terminology, allowing historical ADR text only when clearly marked as history. Remove dead change-notice code and unused exports. Review public declaration output for accidental exposure of private peer or storage internals.

Run at least:

```sh
pnpm --filter std-toolkit lint
pnpm --filter std-toolkit build
pnpm --filter std-toolkit stories
pnpm --filter std-toolkit test
```

If the package test script requires an unavailable DynamoDB service, run all tests that do not require it, record the exact limitation in `progress.md`, and do not claim a full pass.

Completion criteria:

- All available checks pass.
- All sync stories pass.
- No unintended old public paths or names remain.
- `progress.md` contains the final commits, check results, remaining risks, and no unresolved task except explicitly documented external blockers.

Commit: `chore(sync): complete sync refactor verification`

## Expected Final Mental Model

Each tab owns a Sync Replica and a TanStack DB Collection Projection. The Backend is authoritative. Backend push or polling makes replicas eventually correct. Peer Sync is a same-origin shortcut: after one tab accepts a backend-confirmed Entity, it sends that Entity to the matching Collection in other live tabs. Each receiving tab applies normal convergence to its own replica and updates its projection. Memory and IndexedDB differ only in durability; both can use Peer Sync.

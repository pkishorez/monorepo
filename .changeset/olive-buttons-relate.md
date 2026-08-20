---
'std-toolkit': patch
---

Expose the latest decoded entity form at every application boundary, and keep encoded values — the ones stamped with `_v` — inside persistence and transport. `EntitySchema` becomes the single complete-entity codec between `EncodedEntity` and `DecodedEntity`: encoding always writes the latest version, decoding accepts and migrates every known version. See ADR 0005.

Also in this release:

- New `Encoded & decoded values` story group covering codec fields end to end at the StdTable level: what you hand a write versus what the row holds, where `_v` lives, that index keys derive from the encoded side, and how a codec field survives an update — verified across DynamoDB, IndexedDB, memory, and SQLite.
- `applyToSyncReplica` validates entity shape again before touching `meta._e`. A mutation handler or `SyncSource.fetch` that returns a malformed entity now fails with `Invalid` instead of killing the sync fiber with a `TypeError`.
- The Sync Replica no longer round-trips accepted entities through encode/decode, and the one decode it still needs — repairing a settle receipt from a stored row — runs after the transaction commits rather than before it, so a stored row this build cannot decode no longer fails the whole batch.

## Breaking changes

This is a deliberate breaking replacement rather than a compatibility layer, because wrappers would preserve exactly the encoded/decoded distinction application code should no longer have to manage. The package is pre-1.0, so it ships as a patch.

- **Persisted Sync Stores must be cleared.** The stored replica record changed from `{ value, meta }` to a single `entity` field with no schema evolution, so existing IndexedDB and SQLite sync stores cannot be read by this version. Clear site data, or drop and recreate the sync store table, as part of the upgrade.
- **`_v` is gone from Entity Meta.** It lives on the encoded value only. Code reading `entity.meta._v` breaks, and decoded meta that still carries `_v` is now actively rejected.
- **`core` renames.** `EntityType` → `DecodedEntity`, `SingleEntityType` → `DecodedSingleEntity`, `MetaSchema` → `EntityMetaSchema`. `EncodedEntity`, `EncodedSingleEntity`, `EntityMeta`, and `SingleEntityMeta` are new. `EntitySchema` and `SingleEntitySchema` are no longer plain `Schema.Struct`s — they are codecs exposing `decode`, `encode`, and `latestVersion`.
- **Sync callbacks changed shape.** `onInsert`, `onUpdate`, `onDelete`, and `SyncSource` fetches take and return `DecodedEntity` / `DecodedSingleEntity`. Returned values are now encoded through the entity schema, so a value that does not match the schema fails with `Invalid` where it previously passed through.
- **Collections now validate.** Keyed and single-item collections carry a Standard Schema, so an insert or update whose item does not match the latest decoded shape is rejected at the mutation instead of reaching the replica.
- **Peer Sync wire format changed.** Peer messages carry encoded entities whose value holds `_v` and whose meta does not. Tabs running the previous version cannot exchange messages with tabs running this one.
- **`isEntity` is now `isDecodedEntity`**, and it also rejects meta containing `_v`.

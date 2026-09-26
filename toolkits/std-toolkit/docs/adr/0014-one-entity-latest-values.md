---
status: superseded by ADR-0015 (0015-rich-values-encoded-storage-key-paths.md)
supersedes: ADR-0005
---

# One Entity with `_v` in meta; application code only sees latest values

ESchema data takes two forms. The **encoded form** is data as it is stored or sent — database, transport, Sync Store, Peer Sync — in whichever version it was written. It is internal: only core's `EntitySchema`, `toSchema` nesting, snapshot and database adapters see it. The **value** is that data in the reader's latest version, typed `typeof X.Type`, and it is the only form application code, the database API, broadcasts, RPC payloads, Collections and Mutation Callbacks handle. Evolutions refuse transformations, so the two forms have the same shape and differ only in version. Decoding is the one conversion from encoded to value and runs migrations; encoding writes the latest version and never migrates. There is no third, application-view form.

There is one **Entity** shape everywhere: `{ value, meta: { _e, _v, _u, _d, _s?, _c? } }`. `_v` lives in Entity Meta because it describes the value rather than being part of it, just as `_e` and `_u` do. A nested ESchema value keeps its own inline `_v` in encoded form, because it evolves independently of the Entity that contains it. An in-memory Entity is always at the latest version. Any Entity crossing a process boundary (database, RPC, Peer Sync, Sync Store) goes through `EntitySchema`, so an RPC that returns `EntitySchema(X)` hands its client latest values.

A receiver answers two separate questions from meta. `_u` says whether the value is newer than what it has. `_v` says whether it can read the value: an older known version is migrated, and a version newer than its code knows makes `EntitySchema` fail with a distinct `OutdatedVersion` error. For Sync this is an **Outdated Application**, not a failure. The Strategy Session stops until reload, neither the Sync Replica nor Sync State advances, and one `OutdatedApplication` Sync Event (the warning) fires per Collection per tab. After a reload with newer code the strategy resumes from its unchanged cursor, and convergence makes the replay safe. Sync State stores its Entities in encoded form, so a cursor saved by older code is migrated when it is read.

Writes carry no version. A server assumes a written value is in its latest version, so a stale tab's write in an old shape fails validation visibly. The Outbox migrates its own queued writes before sending them.

## Considered Options

- **Decoded values at every application boundary (ADR 0005).** While evolutions refused transformations this cost nothing, because the decoded form was only a copy of the value. A real decoded form would have forced every key derivation, query operand and RPC contract to convert both ways, and let a local view leak into frozen storage contracts.
- **An optional decoded view attached to the ESchema (`withDecoded`) and used only by Sync Collections.** Built and then removed before release. It gave users three forms to learn for a feature no application used, overloaded "decode" to mean both migration and view projection, and left Collections showing one type while Mutation Callbacks received another. A richer view can be reconsidered later as Collection configuration rather than a schema concern.
- **Separate stored and migrated entity types.** Rejected: they are the same shape a few versions apart, and an entity without `_v` cannot safely cross a process boundary.
- **Sync Sources returning raw encoded entities so Sync migrates them itself.** Rejected because it puts the encoded form back into application RPC contracts. A distinct `OutdatedVersion` error keeps it internal and also gives non-Sync callers a clear failure.
- **Resetting Sync State when a collection's latest version changes at boot.** Rejected: not advancing past an unreadable Entity already guarantees it is replayed after an upgrade, without refetching data that is already persisted.
- **A version on every write.** Rejected: it only guards a field whose meaning changes while its shape stays the same, which the rule below forbids.

## Consequences

The public type carriers are Effect's names: `X.Type` for the value and `X.Encoded` for the encoded form. The snapshot captures encoded shapes only. Evolutions refuse constructor defaults and transformations, so the snapshot-limitation concept disappears; conversion to richer types happens in application code after reading. A field must never change meaning without changing its name or shape.

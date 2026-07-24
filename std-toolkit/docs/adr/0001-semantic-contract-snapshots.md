# Semantic contract snapshots replace source tracking

std-toolkit will protect persisted data by snapshotting the semantic contracts declared by ESchemas and database tables instead of tracking source files or enforcing a generated folder structure. The canonical artifact is versioned structured JSON, with deterministic human-readable rendering for tests and reviews; snapshot storage and approval remain outside the library so the same evidence can serve Vitest, CI, deployment systems, and a unified UI.

## Decision

Every ESchema and adapter table can synchronously produce an opt-in snapshot. `std-toolkit/snapshot` owns the shared pure operations for inspecting, diffing, and rendering snapshots, while decoding unknown stored JSON returns an Effect that validates references and migrates older snapshot formats through an internal ESchema.

An ESchema snapshot describes the encoded and decoded data contract of every version using Effect Schema representations. Nested ESchemas are stored once under stable identities and referenced from every use, so evolving a child is visible as a safe transitive change without requiring a parent version. Migrations, presentation-only annotations, and singleton default values are excluded because they are not persisted data contracts. Stable public Effect transformations are named; custom or unstable transformations retain their encoded and decoded sides but are marked `unverifiable`.

A table snapshot adds a normalized adapter identity, physical primary and secondary index topology, every registered entity's complete ESchema snapshot, and every entity's primary and secondary index derivations. Runtime table names, connections, regions, billing state, row counts, physical index status, and other operational state are excluded. DynamoDB, SQLite, and IndexedDB produce the same logical document and change model, with adapter-specific topology expressed through normalized index kinds.

Snapshot comparison returns a deterministic ordered list of independently classified changes, never one overall verdict. The classifications are `safe`, `requires-backfill`, `breaking`, and `unverifiable`. Current-state limitations are reported separately by inspection, so an unchanged custom transform remains visible without fabricating a historical change.

## Classification policy

Adding the next ESchema version is safe. Changing or deleting any version already present in an approved snapshot is breaking, including the latest approved version. Adding a nested version is safe and produces transitive entries for parents that reference it. Migration-only and cosmetic changes do not appear.

Changing a table's primary topology, entity identity, entity id field, keyed-versus-singleton kind, or primary index derivation is breaking. Adding or changing a secondary physical index or entity derivation requires backfill; removing an unused secondary physical index or entity derivation is safe. Adding an entity is safe, removing or renaming one is breaking, and comparing snapshots from different adapters is unverifiable. Structurally invalid stored snapshots, including dangling references, are rejected before comparison.

## Consequences

The existing `eschema` CLI, its source snapshots, generated directories, manifest hashes, approval commands, and package binary are removed. Consumers decide where approved JSON lives and when a new baseline is accepted. A first snapshot has no synthetic diff; it is inspected and explicitly stored as the initial baseline.

Snapshot output is canonicalized so declaration order, registration order, and presentation metadata cannot create noise. Meaningful order, including ESchema version order and order-sensitive schema constructs, is preserved. Reusing one nested ESchema in multiple fields is valid and produces multiple references to one definition; two distinct ESchemas may not claim the same snapshot identity.

Rejected: retaining source-file tracking, embedding approval storage in std-toolkit, treating JSON Schema as the canonical representation, hashing migration functions, requiring parent versions for nested evolution, or collapsing change classifications into a single pass/fail status.

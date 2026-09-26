# Snapshot — Ubiquitous Language

Semantic contract capture and comparison for database tables. Snapshot consumes structural descriptions from other contexts without owning schema evolution or database registration, and it never runs at request time.

## Language

**Table snapshot**:
The one snapshot document: a table's topology, its registered entities with their key derivations and access patterns, and every version of every ESchema the table reaches, on both encoded and decoded sides. Each ESchema, nested ones included, appears once under its **snapshot identity**; a field that composes another ESchema is a reference to it, so a nested ESchema's versions are frozen by the same rules as a top-level one. It excludes migration behavior and presentation-only annotations.
_Avoid_: ESchema snapshot (retired: there is no ESchema-only document), source snapshot, version-file snapshot.

**Snapshot change**:
One semantically coherent difference between two **table snapshots**, with its own safety classification. An addition or removal names the affected contract element; an edit describes its exact nested differences; an added, removed, or retargeted **entity reference** is safe because it affects visualization metadata rather than persisted data or runtime behavior.
_Avoid_: Overall status, snapshot result.

**snapshot verification**:
A comparison of a current **table snapshot** with an earlier one, yielding **snapshot changes** that each keep their own safety classification. The new snapshot is upgradable when no change is `breaking` or `unverifiable`. Snapshot provides only the comparison; the baseline it compares against belongs to the caller. The one baseline the toolkit keeps is the alchemy **snapshot guard**'s, in Alchemy state. A committed file snapshot in a test suite is a recommended reviewing aid.
_Avoid_: Safety assessment, snapshot approval, approved snapshot file, contract file, enforcement baseline (retired: nothing is stored inside the table).

**Snapshot guard**:
The Alchemy resource in `std-toolkit/alchemy` that keeps the last accepted **table snapshot** for one physical table in Alchemy state. On each deploy it runs **snapshot verification** against that snapshot and fails the deploy when the new one is not upgradable; a `requires-backfill` change is accepted with a warning. A new physical target starts a fresh baseline. It runs only at deploy, never in a layer or a request.
_Avoid_: Enforcement, deploy gate, contract resource.

**Snapshot document format**:
The versioned shape of a stored snapshot itself, distinct from the **versions** of the schemas it describes. A snapshot written under an older format is read forward into the current one, so a stored snapshot never becomes unreadable because the toolkit moved on.
_Avoid_: Retired format, snapshot schema version.

**snapshot limitation**:
An aspect of the current contract whose behavior cannot be verified from snapshot data. The only limitation a field can still carry is a constructor default — it changes `Schema.make(...)` convenience construction, not decode/encode fidelity, so eschema tracks it rather than refusing it. Every other limitation this term once covered — an unnamed transformation, filter, or declared type — can no longer occur: eschema refuses that field the moment it is defined, before a snapshot ever sees it. An approved unchanged limitation remains visible without causing verification to fail.
_Avoid_: Snapshot change, verification failure, warning.

**snapshot identity**:
The stable name of an ESchema within a **table snapshot**, taken from the ESchema's own mandatory name. One ESchema may be referenced any number of times under the same identity, while every distinct ESchema has a distinct identity.
_Avoid_: Generated ID, traversal ID.

**restored schema**:
A live, working schema rebuilt from a **table snapshot** alone, with no access to the original source. Restore is internal: it is not part of the public API, and its tests prove that capture loses nothing. Restore is the mirror of capture, and it is sound because captured fields contain the identity needed to restore them. ESchema refuses unrepresentable fields at definition time, except for the known `Schema.UniqueSymbol` edge case: a local symbol fails during capture, while a registered `Symbol.for(...)` value can be captured and restored. A composed field restores by resolving its **snapshot identity** reference, not by reviving the wrapper that produced it.
_Avoid_: Reconstructed type, rebuilt schema.

**Entity Relationship view**:
A visual projection of a table snapshot's Entities, current fields, own identifiers, and explicitly declared entity references, including nested and external targets. Each reference is one directed connector from its source field to the target Entity's `idField`; no reverse connector is inferred, and table topology and access patterns are separate views.
_Avoid_: Table topology graph, schema dependency graph.

**external target**:
The named target of an **entity reference** that is absent from the viewed table snapshot. It remains visible without an invented identifier field.
_Avoid_: Missing Entity, invalid reference.

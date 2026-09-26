# Snapshot — Ubiquitous Language

Semantic contract capture and comparison for database tables. Snapshot consumes structural descriptions from other contexts without owning schema evolution or database registration, and it never runs at request time.

## Language

**Table snapshot**:
The one snapshot document: a table's topology, its registered entities with their key derivations and access patterns, and every version of every ESchema the table reaches, in **encoded form**, described in **snapshot types**. Each ESchema, nested ones included, appears once under its **snapshot identity**; a field that composes another ESchema is a reference to it, so a nested ESchema's versions are frozen by the same rules as a top-level one. It excludes migration behavior and presentation-only annotations; **checks** are recorded for display but are not part of the contract. Capture is one-way: a table snapshot is never turned back into a schema.
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

**Snapshot type**:
One node of the toolkit's own language for describing a data shape inside a **table snapshot**: string, number, boolean, null, literal, struct, array, string-keyed record, union, an opaque value whose shape is not guarded, a reference to another ESchema by its **snapshot identity**, or a recursive shape that refers back to itself by position rather than by a generated name. An enum is described as the union of its values, since only the values are persisted. The language is defined by eschema, which refuses any field it cannot describe, and is owned by the toolkit, so a change in how Effect Schema describes itself can never alter a stored snapshot.
_Avoid_: Representation (Effect's term), serialized schema, IR, AST.

**Check**:
A validation attached to a **snapshot type**, recorded for display only: a built-in check from a fixed catalogue with its arguments, or a custom check described by the user's own name. A check that is neither cannot be captured. Each check is unique on its node, and only checks the user wrote on the stored side are recorded. Checks are never compared: adding, removing, or changing one is never a **snapshot change**, because a check only narrows which values are accepted and can always be relaxed again, while a data shape change cannot be undone once rows are written.
_Avoid_: Filter (Effect's term), constraint, validation rule.

**snapshot identity**:
The stable name of an ESchema within a **table snapshot**, taken from the ESchema's own mandatory name. One ESchema may be referenced any number of times under the same identity, while every distinct ESchema has a distinct identity.
_Avoid_: Generated ID, traversal ID.

**Entity Relationship view**:
A visual projection of a table snapshot's Entities, current fields, own identifiers, and explicitly declared entity references, including nested and external targets. Each reference is one directed connector from its source field to the target Entity's `idField`; no reverse connector is inferred, and table topology and access patterns are separate views.
_Avoid_: Table topology graph, schema dependency graph.

**external target**:
The named target of an **entity reference** that is absent from the viewed table snapshot. It remains visible without an invented identifier field.
_Avoid_: Missing Entity, invalid reference.

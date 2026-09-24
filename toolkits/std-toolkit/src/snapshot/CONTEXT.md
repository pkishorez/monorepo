# Snapshot — Ubiquitous Language

Semantic contract capture and comparison for ESchemas and database tables. Snapshot consumes structural descriptions from other contexts without owning schema evolution or database registration.

## Language

**ESchema snapshot**:
A structured, serializable description of every ESchema version on both its encoded and decoded sides, including any data constraints that cannot be described faithfully. It preserves the identity of nested ESchemas, excludes migration behavior and presentation-only annotations, and may be rendered as stable human-readable text.
_Avoid_: Source snapshot, version-file snapshot.

**ESchema snapshot change**:
One semantically coherent difference between two **ESchema snapshots**, with its own safety classification. An addition or removal names the affected contract element; an edit describes its exact nested differences; an added, removed, or retargeted **entity reference** is safe because it affects visualization metadata rather than persisted data or runtime behavior.
_Avoid_: Overall status, snapshot result.

**snapshot verification**:
A comparison of a current contract with an earlier capture of it, yielding **ESchema snapshot changes** that each keep their own safety classification. Snapshot provides only the comparison; the baseline it compares against and the decision what to do with the result belong to the caller. The one baseline the toolkit itself keeps is db's **Enforcement baseline**. A committed file snapshot in a test suite is a recommended reviewing aid, not a toolkit mechanism.
_Avoid_: Safety assessment, snapshot diff, snapshot approval, approved snapshot file, contract file (the file-based CLI baseline is retired).

**Golden row**:
One generated value of a **version** together with what the next version's migration turns it into, both kept in their encoded forms. Rows exist only in a test suite's committed table snapshot file, never in a table's Enforcement baseline and never as table items. They are drawn once, when a migration step first enters that file, and replayed from the file afterwards, so a rewritten or impure migration changes a stored output and is a breaking **ESchema snapshot change**. Adding a version adds rows and never touches existing ones. Authors never write rows by hand.
_Avoid_: Sample, fixture, example data, migration hash.

**Snapshot document format**:
The versioned shape of a stored snapshot itself, distinct from the **versions** of the schemas it describes. A snapshot written under an older format is read forward into the current one, so a stored snapshot never becomes unreadable because the toolkit moved on.
_Avoid_: Retired format, snapshot schema version.

**snapshot limitation**:
An aspect of the current contract whose behavior cannot be verified from snapshot data. The only limitation a field can still carry is a constructor default — it changes `Schema.make(...)` convenience construction, not decode/encode fidelity, so eschema tracks it rather than refusing it. Every other limitation this term once covered — an unnamed transformation, filter, or declared type — can no longer occur: eschema refuses that field the moment it is defined, before a snapshot ever sees it. An approved unchanged limitation remains visible without causing verification to fail.
_Avoid_: Snapshot change, verification failure, warning.

**snapshot identity**:
The stable name of an ESchema within an **ESchema snapshot**, taken from the ESchema's own mandatory name. One ESchema may be referenced any number of times under the same identity, while every distinct ESchema has a distinct identity.
_Avoid_: Generated ID, traversal ID.

**restored schema**:
A live, working schema rebuilt from an **ESchema snapshot** alone, with no access to the original source. Restore is the mirror of capture, and it is sound because captured fields contain the identity needed to restore them. ESchema refuses unrepresentable fields at definition time, except for the known `Schema.UniqueSymbol` edge case: a local symbol fails during capture, while a registered `Symbol.for(...)` value can be captured and restored. A composed field restores by resolving its **ESchema snapshot** reference, not by reviving the wrapper that produced it.
_Avoid_: Reconstructed type, rebuilt schema.

**Entity Relationship view**:
A visual projection of a table snapshot's Entities, current fields, own identifiers, and explicitly declared entity references, including nested and external targets. Each reference is one directed connector from its source field to the target Entity's `idField`; no reverse connector is inferred, and table topology and access patterns are separate views.
_Avoid_: Table topology graph, schema dependency graph.

**external target**:
The named target of an **entity reference** that is absent from the viewed table snapshot. It remains visible without an invented identifier field.
_Avoid_: Missing Entity, invalid reference.

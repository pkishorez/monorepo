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
A check that the current contract exactly matches its approved baseline. Missing baselines and all differences require approval; each difference retains its independent safety classification.
_Avoid_: Safety assessment, snapshot diff.

**snapshot approval**:
The explicit acceptance and storage of the current contract as the new baseline, independent of the safety classification of its changes. This is the CLI's file-based baseline only. db's Table-level enforcement is a distinct mechanism, gated by classification: it stores its own baseline inside the table and only ever moves it forward on a `safe` or `requires-backfill` diff, never unconditionally.
_Avoid_: Safe change, automatic acceptance.

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

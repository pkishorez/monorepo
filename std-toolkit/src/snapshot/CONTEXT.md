# Snapshot — Ubiquitous Language

Semantic contract capture and comparison for ESchemas and database tables. Snapshot consumes structural descriptions from other contexts without owning schema evolution or database registration.

## Language

**ESchema snapshot**:
A structured, serializable description of every ESchema version on both its encoded and decoded sides, including any data constraints that cannot be described faithfully. It preserves the identity of nested ESchemas, excludes migration behavior and presentation-only annotations, and may be rendered as stable human-readable text.
_Avoid_: Source snapshot, version-file snapshot.

**ESchema snapshot change**:
One difference between two **ESchema snapshots**, with its own safety classification and description. A snapshot comparison is a list of changes, not a single overall verdict.
_Avoid_: Overall status, snapshot result.

**snapshot identity**:
The stable name of an ESchema within an **ESchema snapshot**, taken from the ESchema's own mandatory name. One ESchema may be referenced any number of times under the same identity, while every distinct ESchema has a distinct identity.
_Avoid_: Generated ID, traversal ID.

**verifiable transformation**:
An Effect-provided schema transformation with a stable public identity that an **ESchema snapshot** can name. Other transformations are represented by their encoded and decoded sides and marked `unverifiable`.
_Avoid_: Inferred transformation, source-hashed transformation.

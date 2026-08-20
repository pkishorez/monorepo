# Snapshot — Ubiquitous Language

Semantic contract capture and comparison for ESchemas and database tables. Snapshot consumes structural descriptions from other contexts without owning schema evolution or database registration.

## Language

**ESchema snapshot**:
A structured, serializable description of every ESchema version on both its encoded and decoded sides, including any data constraints that cannot be described faithfully. It preserves the identity of nested ESchemas, excludes migration behavior and presentation-only annotations, and may be rendered as stable human-readable text.
_Avoid_: Source snapshot, version-file snapshot.

**ESchema snapshot change**:
One semantically coherent difference between two **ESchema snapshots**, with its own safety classification. An addition or removal names the affected contract element; an edit describes its exact nested differences. A snapshot comparison is a list of changes, not a single overall verdict or an unstructured replacement of an entire contract section.
_Avoid_: Overall status, snapshot result.

**snapshot verification**:
A check that the current contract exactly matches its approved baseline. Missing baselines and all differences require approval; each difference retains its independent safety classification.
_Avoid_: Safety assessment, snapshot diff.

**snapshot approval**:
The explicit acceptance and storage of the current contract as the new baseline, independent of the safety classification of its changes.
_Avoid_: Safe change, automatic acceptance.

**snapshot limitation**:
An aspect of the current contract whose behavior cannot be verified from snapshot data. An approved unchanged limitation remains visible without causing verification to fail.
_Avoid_: Snapshot change, verification failure, warning.

**snapshot identity**:
The stable name of an ESchema within an **ESchema snapshot**, taken from the ESchema's own mandatory name. One ESchema may be referenced any number of times under the same identity, while every distinct ESchema has a distinct identity.
_Avoid_: Generated ID, traversal ID.

**verifiable transformation**:
An Effect-provided schema transformation with a stable public identity that an **ESchema snapshot** can name. Other transformations are represented by their encoded and decoded sides and marked `unverifiable`.
_Avoid_: Inferred transformation, source-hashed transformation.

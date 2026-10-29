# Snapshot — Ubiquitous Language

Semantic contract capture and comparison for database tables. Snapshot consumes structural descriptions from other contexts without owning schema evolution or database registration, and it never runs at request time.

## Language

**Table snapshot**:
The one snapshot document: a table's topology, its registered entities with their key derivations and access patterns, and every version of every ESchema the table reaches, in **encoded form**, described in **snapshot types** and marked when it is an [[eschema]] **gap version**, and the table's [[db]] **Backfill**s (what each fills or reindexes, never its `run`). Each ESchema, nested ones included, appears once under its **snapshot identity**; a field that composes another ESchema is a reference to it, so a nested ESchema's versions are frozen by the same rules as a top-level one. It excludes migration behavior and presentation-only annotations; **checks** are recorded for display but are not part of the contract. Capture is one-way: a table snapshot is never turned back into a schema.
_Avoid_: ESchema snapshot (retired: there is no ESchema-only document), source snapshot, version-file snapshot.

**Snapshot change**:
One semantically coherent difference between two **table snapshots**, with its own safety classification. An addition or removal names the affected contract element; an added gap version needs a Backfill, and a shipped Backfill removed, or changed in what it fills, is breaking; an edit describes its exact nested differences; an added, removed, or retargeted **entity reference** is safe because it affects visualization metadata rather than persisted data or runtime behavior.
_Avoid_: Overall status, snapshot result.

**snapshot verification**:
A comparison of a current **table snapshot** with an earlier one, yielding **snapshot changes** that each keep their own safety classification. The new snapshot is upgradable when no change is `breaking` or `unverifiable`. Snapshot provides only the comparison; the baseline it compares against belongs to the caller. The toolkit keeps two: the **Stored contract**, with the data, and the **Deployed contract**, in Alchemy state. For a **Persistent table**, a committed file snapshot, checked by [[db]]'s `expectTableShippable` (`@kestack/std-toolkit/db/testing`, built on the file check in `snapshot/vitest`), catches a change before review; setup and the **Deploy guard** are what refuse it.
_Avoid_: Safety assessment, snapshot approval, approved snapshot file, contract file, enforcement baseline.

**Deploy guard**:
The Alchemy resource in `@kestack/std-toolkit/alchemy` that keeps the **Deployed contract** for one StdTable in Alchemy state, named after the StdTable's logical name. Declaring one says the table is persistent, so it takes no mode; one guard covers every physical table of that StdTable, since they share the contract the code ships. On each deploy it plans against it by setup's own rules and fails the deploy where setup would refuse: a change that is not upgradable, a switch to disposable, or a change that needs a **Backfill** no declared one covers (in practice an index change with no `{ reindex }`, since a gap version without its Backfill does not compile). It never warns and passes. It is for a persistent table whose setup runs only later, on a device or an object (IndexedDB, Durable Objects); a table Alchemy deploys (D1, DynamoDB) is set up at deploy, against its **Stored contract**, and needs no guard. It keeps one contract per physical table, so a new table starts fresh and one moved away from is still checked against its own data when it is moved back to. It runs only at deploy, never in a layer or a request.
_Avoid_: Snapshot guard (retired), enforcement, deploy gate, contract resource.

**Stored contract**:
The **table snapshot** the data in one physical table was last set up under, kept inside that table as reserved rows app code never sees (one for the table, one per entity, one per version of each ESchema it reaches, one per **Backfill**), together with the table's **Table mode**. A version's row is written when first shipped, rewritten only when an accepted change loosens it, so no row grows with history, and every adapter keeps it the same way. It is the baseline: setup compares the current snapshot with it, so a device or object that skipped releases is compared from where its own data actually is. A table that holds rows but no Stored contract is refused if persistent and wiped if disposable.
_Avoid_: Baseline item, schema version row, enforcement baseline.

**Deployed contract**:
The **table snapshot** last shipped for one persistent StdTable, kept in Alchemy state. Checking it at deploy stops a change before it reaches any device or object. It is a guard ahead of the **Stored contract**, never a replacement for it.
_Avoid_: Approved snapshot, baseline.

**Snapshot document format**:
The versioned shape of a stored snapshot itself, distinct from the **versions** of the schemas it describes. A snapshot written under an older format is read forward into the current one, so a stored snapshot never becomes unreadable because the toolkit moved on.
_Avoid_: Retired format, snapshot schema version.

**Snapshot type**:
One node of the toolkit's own language for describing a data shape inside a **table snapshot**: string, number, boolean, null, literal, struct, array, string-keyed record, union, an opaque value whose shape is not guarded, a reference to another ESchema by its **snapshot identity**, or a recursive shape that refers back to itself by position rather than by a generated name. An enum is described as the union of its values, since only the values are persisted. The language is defined by eschema, which refuses any field it cannot describe, and is owned by the toolkit, so a change in how Effect Schema describes itself can never alter a stored snapshot.
_Avoid_: Representation (Effect's term), serialized schema, IR, AST.

**Check**:
A validation attached to a **snapshot type**: a built-in check from a fixed catalogue with its arguments, or a custom check described by the user's own name. A check that is neither cannot be captured. Each check is unique on its node, and only checks the user wrote on the stored side are recorded. Every stored row passed the checks of its version, so on an approved version a check may be removed or loosened (a wider bound) as a safe **snapshot change**, and adding or tightening one is breaking: a row that fails it no longer reads. Adding `finite` to a number is safe, since JSON cannot hold a non-finite number in a form that reads back.
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

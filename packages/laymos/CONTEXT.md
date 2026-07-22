# CONTEXT — laymos

Glossary for laymos: layers, modules, stories — declared intent and actual
state, merged. Definitions only; no implementation detail.

## Language

### Static pillars

**Source root**:
A configured project-relative file or folder that defines the complete static
analysis universe. Only supported source files beneath source roots participate
in rules or coverage; Git state has no bearing on membership.

**Layer**:
A named, disjoint set of folders or files — one band of the architecture.
Paths are plain prefixes, never patterns; nesting resolves by longest prefix,
so disjointness holds by construction.
Explicit by definition: no implicit or "open" layers. A layer exists only
through graph membership — there is no standalone layer registry, and a layer
with no edge in any graph is not part of the architecture. A name denotes
exactly one layer definition across the whole config; the same holds for
graph names.
_Avoid_: band, tier

**Layer graph**:
A DAG of layers where an edge means "may import" and absence of an edge
forbids. Reachability is transitive. A project may define several graphs; they
organize and communicate.
_Avoid_: stack (the predecessor's term — retired)

**Union**:
The merge of all layer graphs' edges — the single graph rules are generated
from. Must be acyclic. Graphs are focused views for communication; the union
is what's enforced, including reachability across graph boundaries.

**Sink layer**:
A layer that declares no outgoing edges. Layers may appear in multiple graphs
whether or not they are sinks.
_Avoid_: shared layer (there is no special kind — just a layer used in
multiple graphs)

**Module**:
A file or folder living in exactly one layer — the longest layer prefix
containing its path; inferred, never declared. Strictly flat — no module
inside another. Declaring one imposes nothing; constraints are opt-in.

**Module rules**:
Opt-in constraints on a module's edges: `canImport` disciplines it as a
consumer, `canImportedBy` protects it as a provider. AND semantics, deny
wins; rules only tighten. May constrain same-layer or cross-layer imports but
can never grant permission denied by the layer graph.

**Ignore**:
The single global set of paths invisible to laymos — no rules, no coverage,
unchecked in both directions. Invisible, not permitted.

**Coverage**:
Two warning-only ratchets: how many files belong to some layer, and, within a
layer, how many belong to some module. Never fails a run.
_Avoid_: gate (coverage is the ratchet, not the gate)

**Violation**:
An actual import forbidden by a layer graph or denied by a module rule. The
verdict is layer/module-level; the evidence is file-level. One import can
violate both a layer and a module rule — both are reported.

### Stories

**Story**:
A named executable narrative for one feature or use case. Its unified account
is discovered in Trace Mode and includes every declared Decision Arm; Scenarios
separately record the concrete routes they execute under arranged conditions.
A Story describes only the explicitly marked Blocks it observes and makes no claim that the
surrounding code or use case is complete. Its purpose is to explain how the
observed implementation logic works, not to claim that the logic has been
proven. It has a required description. Its identity is the project-relative
path of its Story file. Its leaf name is unique among Stories in the same
Story Group, or among Standalone Stories, but may repeat in different Story
Groups.
A Story belongs to at most one Story Group; without one, it is a Standalone
Story.
_Avoid_: coverage suite, specification

**Trace Mode**:
The side-effect-free exploration of a Story's narrated flow. It follows every
declared Decision Arm to reveal the unified Story independently of concrete
Scenario observations.
_Avoid_: no-op mode, dry run

**Standalone Story**:
A Story that belongs to no Story Group and sits directly in the Story
collection.
_Avoid_: root Story, global Story, ungrouped Story

**Story path**:
The authored hierarchical position of a Story. It consists of its ancestor
Story Group names followed by the Story's leaf name and is independent of the
Story file's location. A Standalone Story's path contains only its leaf name.
Every level has one shared namespace for child Story Groups and Stories, so
each Story path identifies one visible destination. Segment names are non-empty
and cannot contain `/`, which is reserved for displaying the path.
_Avoid_: Story ID, file path

**Story group**:
A named collection of Stories with a required description that may belong to
one parent Story Group, forming a hierarchy. Story membership is exclusive
rather than tag-like; a Story Group is not itself a Story. Its identity is its
full path of Story Group names. Declarations of the same identity must agree on
metadata.
_Avoid_: folder, category

**Story catalog**:
The discoverable collection of Story identities, names, descriptions, and
Story Group hierarchy available before any Story executes.
_Avoid_: Report, Artifact

**Scenario**:
One concrete set of conditions prepared for the same Story execution. Its
preparation, verification, and optional cleanup are operational boundaries,
not part of the Story's narrated execution. It directly owns the Block Visits
observed during its run. It has no generated or author-supplied identifier — it
is identified by its declaration position within the Story — and it has a
required description. Every runnable Scenario explicitly verifies either a
successful value or a typed error; only a skipped Scenario has no verification.
Scenarios form a flat list declared synchronously and directly within a Story;
the Story runner executes them sequentially in declaration order, each at most
once per generation. Execution nesting is represented by Block Visits instead.
_Avoid_: path, test case

**Scenario outcome**:
The final runner-owned state of a Scenario: succeeded, failed, interrupted, or
skipped. Success means the Story execution produced the kind of result the
Scenario intentionally verifies: either a value or a typed error. Defects and
interruption cannot be accepted as expected results. A skipped Scenario remains
part of the Story but has no Block Visits. A cleanup failure fails the Scenario;
when several operational phases fail, each failure remains distinguishable.

**Scenario preparation**:
The operational phase that establishes one Scenario's conditions and produces
one explicit value for the Story execution. It is outside the narrated
execution.

**Story execution**:
The single operation every runnable Scenario invokes exactly once. It accepts
that Scenario's prepared value and explicitly produces either a success value
or a typed error. It is the only phase recorded as narrative.

**Story environment**:
The fixed set of service implementations under which every Scenario prepares,
executes, verifies, and cleans up. Scenarios vary explicit prepared values and
service state, not the Story's dependency graph.

**Scenario verification**:
The operational phase that intentionally checks either the Story execution's
success value or its typed error. Every runnable Scenario has exactly one such
expectation. Verification is outside the narrated execution.

**Scenario cleanup**:
An optional operational phase that releases or restores what Scenario
preparation established. It runs whenever preparation produced a value and is
outside the narrated execution. Its failure affects Scenario success without
replacing a failure from an earlier phase.

**Block**:
A marked unit of runtime narrative with a short name and a required, non-empty
explanation of what it does and why. Its identity is generated rather than
supplied by the author, and is not expected to remain stable across story
generations. Every block may contain nested block visits. Which primitive
marked it is not part of the narrative; only decisions are a distinct kind,
because they declare arms.

**Block visit**:
One occurrence of a block during a scenario. Repeated and recursive execution
creates distinct visits to the same block, preserving each occurrence and its
place in the narrative. A visit records when it began and how long it ran —
timing is Scenario evidence, never Block identity. A visit has no identity of
its own; it is identified by its position in the scenario's Execution Path.
_Avoid_: block instance, block visit ID (retired)

**Execution path**:
The recursive structure that directly holds a Scenario's Block Visits. Array
order is sequential, parallel branches are explicit, and nesting expresses
containment; a Block Visit carries only its facts, never these relationships.
Parallelism is always genuine: a parallel item holds at least two non-empty
branches, never zero or one.

**Visit outcome**:
The completion state of a block visit: succeeded, failed, or interrupted.
Values and errors are not captured unless the author provides safe narrative
attributes. Interruption is used only for cancellation without failure.

**Attributes**:
Author-supplied, JSON-serialized details attached to one block visit. They are
Scenario evidence, never Block identity or unified Story content. Invalid JSON
data fails Scenario recording rather than being silently discarded.

**Arm**:
One structural output of a decision, not itself a block or block visit. A
literal-keyed Arm is selected by that literal; an Otherwise Arm catches every
unhandled literal. Every Arm has a required, non-empty description of what the
choice means and may have a distinct narrative name.
The selected arm is recorded on the decision visit and routes to that visit's
child execution path; a declared but never-taken arm is shown as unobserved.
What's behind an unobserved arm is invisible, without implying that the story
is incomplete. A decision visit always has a selected arm, including when that
arm later fails or is interrupted.

**Artifact**:
The generated record of one story's Block definitions, Scenarios, Block Visits,
and Execution Paths returned by an explicit run. It records when it was
generated and is never persisted by Laymos.
_Avoid_: report (that is the aggregate of several artifacts)

**Report**:
The fully assembled in-memory aggregate of every story's Artifact — the value
visualization consumes. Assembled, never stored.
_Avoid_: artifact (that is the generated record of one story)

**Story runner**:
The laymos-owned executor behind story generation: it discovers Story files,
runs each Scenario's preparation, the shared Story execution, and verification
sequentially against real integrations, performs cleanup when declared, and
produces Artifacts. Stories are not tests and no test framework is involved.
_Avoid_: test runner

**Scenario recorder**:
The internal context installed by the Story runner only around the shared Story
execution. Blocks record only while this context is active. During Scenario
preparation and verification, and outside a Story run, they only execute their
wrapped code. Evidence the recorder cannot place unambiguously — overlapping
visits with no spanning Block — fails the Scenario rather than being recorded
best-effort.

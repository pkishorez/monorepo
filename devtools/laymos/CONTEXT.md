# CONTEXT — laymos

Glossary for laymos: layers, modules, stories, and tests — declared intent and
actual state, merged. Definitions only; no implementation detail.

## Language

### Static pillars

**Source root**:
A configured project-relative file or folder that defines the complete static
analysis universe. Only supported source files beneath source roots participate
in rules or coverage; Git state has no bearing on membership.

**Layer**:
A named and described, disjoint set of folders or files — one band of the
architecture. Its description states the intent of the architectural boundary.
Paths are plain prefixes, never patterns; nesting resolves by longest prefix,
so disjointness holds by construction.
Explicit by definition: no implicit or "open" layers. A layer exists only
through graph membership — there is no standalone layer registry, and a layer
with no edge in any graph is not part of the architecture. A name denotes
exactly one layer definition across the whole config; the same holds for
graph names.
_Avoid_: band, tier

**Layer graph**:
A named and described DAG of layers where an edge means "may import" and
absence of an edge forbids. Its description states why the included Layers are
presented together. Reachability is transitive. A project may define several
graphs; they organize and communicate.
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
A described file or folder living in exactly one layer — the longest layer
prefix containing its path. Its layer membership is inferred, never declared.
Modules are strictly flat, with no Module inside another. Declaring one
imposes nothing; constraints are opt-in.

**Laymos surface**:
The optional flat `laymos/` directory owned by one folder Module. It contains
that Module's Stories, Tests, and their support material. It is invisible to
static architecture and may depend on application code, while application code
may never depend on it. File Modules have no Laymos surface.

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

**Project Narrative**:
The optional, project-level human account of what the system is and how to
explore it. It is one named Markdown document and is not an executable Story.
_Avoid_: Project Story

**Story ejection**:
The project-wide removal of Story Block narration from application code. The
complete rewrite is planned before any file changes and is applied atomically;
every Module-owned Laymos surface remains untouched. Retained Stories still
execute their Scenarios but lose the structural narration supplied by their
production Blocks, while retained Tests are unaffected.
_Avoid_: unstory

**Story source projection**:
A read-only view of application source with its Story narration retired. Its
ejected form is identical to Story ejection output; its clean form retains only
the source context relevant to selected Story elements.
_Avoid_: preview

**Story**:
A named executable narrative for one independently explainable intended
behavior. A broader flow that combines several independently meaningful
behaviors is a composition of Stories, not itself a Story. Its unified account
is discovered in Trace Mode and includes every declared Decision Arm; Scenarios
separately record the concrete routes they execute under arranged conditions.
A Story describes only its explicitly marked Blocks and Omissions and makes no
claim that the surrounding code or use case is complete. Its purpose is to
explain how the observed implementation logic works, not to claim that the
logic has been proven. It has a required description and a human-facing name.
Its identity is its owning Module together with its Story Key. Every Story
belongs to exactly one folder Module through that Module's Laymos surface; a
Module may own any number of Stories, including none.
_Avoid_: coverage suite, specification

**Story Key**:
The kebab-case, Module-local name that distinguishes one Story from the others
in the same Laymos surface. It is independent of the Story's human-facing name.
_Avoid_: Story file path, Story ID

**Owning Module**:
The one folder Module whose Laymos surface contains a Story.

**Participating Module**:
A Module containing at least one Block in a Story's complete structural trace.
Participation does not imply Story ownership or Scenario observation.

**Observed Module**:
A Participating Module whose Block was visited by one Scenario.

**Story coverage**:
The degree to which one Story's Traversal Scope is narrated by Blocks,
deliberately excluded by Omissions, or left Unnarrated. It judges authored
narration only and neither follows unmarked helper bodies nor claims that code
executed or behavior was proven. It is reported only for an individual Story as
three separate percentages that total one hundred; it is never rolled up to a
Module, Layer, or Project score.
_Avoid_: code coverage, test coverage, Story traversal narration

**Trace Mode**:
The side-effect-free exploration of a Story's narrated flow. It follows every
declared Decision Arm to reveal the unified Story independently of concrete
Scenario observations.
_Avoid_: no-op mode, dry run

**Story Trace**:
The purely structural account produced by Trace Mode. It contains narrated
structure and Omissions, never timings, outcomes, failures, runtime attributes,
or other Scenario evidence. A failed trace may retain an explicitly incomplete
account for diagnosis but is never a valid Story Trace.

**Story catalog**:
The discoverable collection of folder Modules with Laymos surfaces and the
Stories each owns, available before any Story executes.
_Avoid_: Report, Artifact

**Story collection**:
The Story Catalog together with the current trace status of every Story. A
trace failure belongs to its Story and does not hide other valid Stories.

**Scenario**:
One concrete set of conditions prepared for the same Story execution. Its
preparation, verification, and optional cleanup are operational boundaries,
not part of the Story's narrated execution. It directly owns the Block Visits
observed during its run. It has no generated or author-supplied identifier — it
is identified by its declaration position within the Story — and it has a
required description. A Scenario varies conditions, a selected Decision route,
or an expected success or typed error; an independently explainable intended
behavior belongs in a separate Story. Every runnable Scenario explicitly verifies either a
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
or a typed error. Scenario evidence is recorded only during this phase; Trace
Mode separately explores the same narrative structure without real values.

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

### Tests

**Test**:
A named executable examination of one functionality across concrete edge cases,
recording expected and actual results for behavioral assurance. Unlike a Story,
it stress-tests behavior rather than explaining an execution flow. Its identity
is its owning Module together with its Test Key. Every Test belongs to exactly
one folder Module through that Module's Laymos surface, and each Test file
declares exactly one Test. A Test has a required human-facing name and
description.
_Avoid_: Test Story, Snapshot Story

**Test Key**:
The kebab-case, Module-local name that distinguishes one Test from the others
in the same Laymos surface. It is independent of the Test's human-facing name.
_Avoid_: Test file path, Test ID

**Test Case**:
One named, described concrete ordered list of input Test Values and one Test
Expectation examined by a Test. Each Test Case explicitly declares positive or
negative intent. A positive case proves accepted behavior; a negative case
proves rejection, failure, or invalid-input behavior. Its name identifies the
case and its required description explains the behavior or edge condition it
proves. The input list is only an argument container, not itself a Test Value.
Test Case execution records the actual value or error; whether the case passes
is derived by comparing it with the Test Expectation.
_Avoid_: Scenario

**Test Expectation**:
The result a Test Case should produce: either a Test Value or a named error. An
expected error is an outcome, not another Value Type.

**Test Report**:
The presentation-neutral account of executed Tests and their Test Cases. For
each Test Case it records positive or negative intent, the case name,
description, inputs, expectation, and actual value or error. Pass or failure
and any diff are derived rather than stored.

**Test Value**:
An input, expected result, or actual result restricted to a string, number, or
boolean. Null, undefined, objects, and arrays are invalid authored values; an
unsupported actual result fails its Test Case rather than becoming a Test
Value.

**Value Type**:
The automatically inferred primitive type of a Test Value: string, number, or
boolean.

**Value Presentation**:
The inferred or reader-selected rendering of a Test Value as plain text,
Markdown, source code, or a primitive value. It is absent from Test definitions
and Test Reports and does not affect comparison.

**Test Case Suggestion**:
An AI-proposed draft containing a case name, inputs, proposed expectation, and
the reason the edge case matters. It becomes a Test Case only after author
review; the current actual result is never adopted as its expectation.

### Story structure

**Block**:
A marked unit of narrative with a short name and a required, non-empty
explanation of what it does and why. Its identity is generated rather than
supplied by the author, and is not expected to remain stable across story
generations. A Block is a Flow, Step, Decision, or Terminal.

**Traversal scope**:
The union of application function bodies that contain a Block or Omission
reached by one Story. A called helper with no reached Story construct is outside
the scope.

**Omitted code**:
Application source deliberately enclosed by an Omission. It is accounted for
separately and counts as neither narrated nor unnarrated.

**Unnarrated code**:
Source within a Traversal scope that is structurally owned by neither a Story
Block nor an Omission. It is the unaccounted remainder after narrated and
omitted lines are removed.
_Avoid_: uncovered code

**Concurrency scope**:
A non-narrative structural container showing concurrent execution settings and
the Block paths beneath them. It contributes execution shape but is not itself
a Block and does not own narrated lines.

**Flow**:
A reusable narrated operation whose internal Flows, Steps, and Decisions are
part of the Story. A Flow preserves its call boundary while allowing the
narrative beneath that boundary to be explored.
_Avoid_: function block, function step

**Shared Flow**:
A Flow with nested narrative that is called more than once in the same Story.
Its internal narrative is presented once and reached from each call through a
Flow Reference. A repeated Flow without nested narrative is not a Shared Flow.

**Flow Reference**:
One call to a Shared Flow in its surrounding narrative. It preserves where the
call occurs while directing the reader to the Shared Flow's internal narrative.
_Avoid_: duplicated Flow, expanded call

**Step**:
An indivisible narrated operation. A Step has no nested narrative.
_Avoid_: leaf block

**Terminal**:
An indivisible narrated declaration that one branch of its nearest containing
Flow ends at this Block, or its Story execution branch when no Flow contains
it. It documents local intent rather than affecting execution or making any
claim about the scope's caller, and may describe successful or erroneous
completion.
_Avoid_: terminal Step, final Step

**Terminal completion**:
The required declared manner in which a Terminal ends its Flow branch: success,
or error with a required domain error name. It is structural documentation,
not a runtime Visit outcome. An ending without declared completion is a Step
rather than a Terminal.

**Terminal mismatch**:
Scenario evidence that continues within the same sequential branch after a
Terminal, or whose Visit outcome contradicts its declared Terminal completion.
It fails that Scenario; parallel siblings and a containing Flow's caller are
unaffected, and an error name is not runtime-validated.

**Decision**:
A narrated choice between declared Arms. When its result is assigned, its Arms
derive one value and the containing Flow continues; it is presented as one
choice whose internal Arms can be expanded. When it is returned, each Arm owns
the remaining execution of that branch. A Decision result cannot be discarded.
Trace Mode explores every Arm; Scenario execution records only the selected
Arm. An exhaustive Decision that receives a value matching no Arm is defective
rather than succeeding with an undefined value.
_Avoid_: conditional block

**Visibility**:
The narrative prominence of a Flow, Step, Decision, or Arm. Primary content is
shown by default; Detail content remains available when a reader asks for a
more complete view. Visibility inherits through nesting: content cannot be more
visible than its containing Flow, Decision, or Arm.

**Omission**:
A source-located marker showing where Trace Mode deliberately stopped without
describing or exploring the underlying operation. It requires a non-empty
reason so the exclusion remains reviewable.
_Avoid_: ignored Block, hidden Block

**Block visit**:
One occurrence of a block during a scenario. Repeated and recursive execution
creates distinct visits to the same block, preserving each occurrence and its
place in the narrative. A visit records when it began and how long it ran —
timing is Scenario evidence, never Block identity. A visit has no identity of
its own; it is identified by its position in the scenario's Execution Path.
_Avoid_: block instance, block visit ID (retired)

**Scenario node coverage**:
The fraction of a Story's traced Blocks visited by the union of its executed
Scenarios. A Block counts once regardless of repeated visits or Visit outcome;
a skipped Scenario contributes no visits. Decision Arm observation is reported
separately.
_Avoid_: test coverage

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
One structural alternative of a Decision, not itself a Block or Block Visit. A
literal-keyed Arm is selected by ordinary strict equality; its key is a string,
boolean, or finite number, with `0` and `-0` denoting the same choice. An
Otherwise Arm catches every unhandled literal. Every Arm has a required,
non-empty description of what the choice means, may have a distinct narrative
name, and has Visibility. Its declared errors exhaustively name its intentional
typed failures. An Arm of a returned Decision may declare successful or named
error completion for its branch; an Arm of an assigned Decision cannot declare
completion because it must produce a value and rejoin the containing Flow.
Errors describe possible escaping failures, while completion describes one
required ending, so an Arm cannot declare both.
Trace Mode explores every Arm body; a Scenario records only its selected Arm
and concrete child Execution Path. A Decision Visit always has a selected Arm,
including when that Arm later fails or is interrupted.

**Story run**:
The runtime evidence produced by executing every selected Scenario of one
Story. It contains the traced Block catalog, Scenario outcomes, failures, Block
Visits, Execution Paths, and Scenario node coverage.
_Avoid_: Story Artifact

**Stories run**:
The aggregate runtime evidence produced by running Scenarios from multiple
Stories.
_Avoid_: Report, Artifacts

**Report**:
The broader assembled Laymos output consumed by visualization. Story
Collections and Story Runs remain distinct parts of it.
_Avoid_: Artifact

**Story runner**:
The laymos-owned executor of Scenario evidence. It requires a valid Story Trace,
runs each Scenario's preparation, Story execution, and verification
sequentially against real integrations, performs cleanup when declared, and
produces Story Runs. Stories are not tests and no test framework is involved.
_Avoid_: test runner

**Trace mismatch**:
A Scenario route that cannot be projected onto its valid Story Trace. It means
runtime evidence reached narrative structure that Trace Mode did not discover.
Laymos does not yet enforce this because raw JavaScript conditionals are outside
the current structural model. Static source analysis may make mismatch
validation reliable later.

**Scenario recorder**:
The internal context installed by the Story runner only around the Story
execution. Blocks record only while this context is active. During Scenario
preparation and verification, and outside a Story run, they only execute their
wrapped code. Evidence the recorder cannot place unambiguously — overlapping
visits with no spanning Block — fails the Scenario rather than being recorded
best-effort.

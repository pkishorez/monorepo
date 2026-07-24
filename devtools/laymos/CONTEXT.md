# CONTEXT — laymos

Glossary for laymos: layers, modules, and tests — declared intent and actual
state, merged. Definitions only; no implementation detail.

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

**Project Narrative**:
The optional, project-level human account of what the system is and how to
explore it. It is one named Markdown document and is not executable.

### Tests

**Test Project**:
One Vitest-configured testing project. It is the outer boundary within which
Vitest discovers Test Modules and applies one testing configuration.

**Test Module**:
One test file discovered by Vitest within a Test Project. It is Vitest's file
boundary and is distinct from a laymos architecture Module.
_Avoid_: Module

**Test Suite**:
A named Vitest group containing nested Test Suites or Test Cases.

**Laymos Suite**:
A Test Suite registered through Laymos with a description and optional
documentation. It adds explanatory metadata without introducing a different
execution or evidence kind.

**Laymos Test**:
A Test Case registered through Laymos that carries a description, optional
documentation, and one or more named Test Assertions. It may also retain a
Test Trace as evidence.

**Test Trace**:
The presentation-neutral runtime span and log capture around the one explicitly
selected Effect within a Laymos Test. A Case retains at most one Test Trace,
which explains execution and timing without changing the Effect's value or
failure. Every captured span must finish within that Effect's structured scope;
an unfinished span makes the trace invalid. Emitted parent relationships are
preserved even when a parent lies outside the capture or the Effect emits
several independent trace trees. Each Test Log belongs to its current captured
span or remains unscoped when no captured span is current.

**Test Log**:
A runtime log retained by a Test Trace with its level, message, timestamp, and
annotations. It is span-scoped when emitted within a captured span and unscoped
otherwise.

**Test Case**:
One independently runnable Vitest test task within a Test Module or Test Suite.
A Laymos Test additionally carries explanatory and assertion evidence.

**Test Assertion**:
A uniquely named expected-versus-actual comparison within a Laymos Test. One
Case may contain several Test Assertions, retained in invocation order, and
every named assertion is evaluated even when an earlier assertion fails. Any
failed assertion fails the Case after its assertion evidence is collected.

**Test Report**:
The presentation-neutral account of Vitest's executed hierarchy and results.
Laymos Tests additionally retain their documentation, Test Assertions, and
optional Test Trace. Each collected Case may include Vitest's one-based
declaration line and column. Vitest does not provide the end of the Case's
source range.

**Test Value**:
A JSON-compatible actual or expected value retained for a Test Assertion.
When an assertion value is not safely JSON-compatible, its Vitest-formatted
text becomes the retained Test Value instead.

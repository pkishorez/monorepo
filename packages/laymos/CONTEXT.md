# CONTEXT — laymos

Glossary for laymos: layers, modules, stories — declared intent and actual
state, merged. Definitions only; no implementation detail.

## Language

### Static pillars

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
from. Must be acyclic. Graphs are for communication; the union is what's
enforced.

**Sink layer**:
A layer that declares no outgoing edges. Any layer appearing in more than one
graph must be a sink — this is what stops cross-graph tunneling.
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
A set of test paths whose union of traces forms one flow graph. One story per
file — hard convention; the file is the isolation and parallelism unit.

**Path**:
One test covering one route through a story's flow. Recording is on only
inside a path body — setup is untraced.

**Block**:
A named unit of runtime narrative. Exactly three kinds: `storyFn` (function
boundary), `step` (inline), `decision` (condition with declared arms).

**Arm**:
One declared outcome of a decision. The taken arm is recorded; a declared but
never-taken arm shows in the graph as a coverage gap. What's behind an
unvisited arm is invisible — accepted.

**Trace**:
The recorded serial sequence of block events for one path invocation.

**Artifact**:
The one JSON per story that merges all its paths: flow graph, visited and
unvisited arms, per-path attributes. The map that production breadcrumbs are
later replayed against.

**Mode**:
A block's runtime behavior: `noop` (production default), `log`, `emit`, or
`trace` (test-time only, set by the vitest integration).

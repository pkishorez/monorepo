# CONTEXT — laymos

Glossary for laymos: layers, modules, and tests — declared intent and actual
state, merged. Definitions only; no implementation detail.

## Language

_Being redefined from scratch._

**Story**:
A named, executable narrative of one behavior of the Project's code — a leaf
of the Story tree. A Story carries a one-line description shown inline in
listings, a detailed markdown page, and an executable program whose run
captures Story artifacts and Story assertions.

**Story question**:
One question-and-answer unit of a Story: a reader-facing question, its prose
answer, and a proof. A Story holds an ordered list of these.

**Proof**:
The executable program attached to one Story question. Running it records
Story sections and Story assertions, and those assertions decide the
question's verdict.

**Story Group**:
A documentation node of the Story tree. It carries a title and one-line
description shown inline in listings plus a detailed markdown page, and holds
either subgroups or Stories — never both. Groups have no verdict of their
own; any rollup is derived from descendant Story reports.

**Story tree**:
A Project's whole documentation-plus-Stories hierarchy, rooted at the Story
Group the Stories path's entry point exposes. Loading it is metadata-only: no
Story executes. Sibling titles must be unique.

**Story id**:
A Story's identity within the Story tree: the titles on the path from the
root to the Story. Story reports attach to the tree by Story id.

**Story artifact**:
A trace or a flow (a flow being a collection of traces) captured during a
Story run through the Story utilities. Every artifact anchors its own Story
section.

**Story section**:
One described step of a Story run: a trace, a flow, or a generic execution,
together with the Story assertions that verify it. Sections are ordered and
give a Story report its structure; every Story assertion belongs to exactly
one section.

**Story assertion**:
A mandatory description paired with a boolean condition, declared inside a
Story's program and recorded when the run reaches it, attaching to the most
recent Story section. Assertion outcomes decide the Story's verdict: passed
when all held, failed when any was false, errored when the program died
before finishing.

**Story context**:
The service the Story runner injects into every Story run. It receives every
captured Story artifact and Story assertion outcome and yields the Story
report. Story utilities are the only way Stories talk to it.

**Story report**:
The structured record of one Story run, attached to the Story tree by Story
id: the verdict plus the ordered Story sections the run recorded.

**Stories path**:
A configured project-relative folder holding all Story files and their single
entry point that exposes the Project's Story tree. It is implicitly an
Ignored path: package-level Stories are exempt from architectural enforcement.

**Support file**:
A file named `support.ts` beneath the Stories path, holding the harness a
Story's proofs import: fixtures, layers, and helpers that would otherwise be
retyped in every Story file. A Story resolves the nearest one at or above its
own folder, so a Story Group shares one; a Story with none carries no support.
It is read as part of the Story tree and shown beside the Story's setup, so a
reader can see the code its proofs stand on.

**Stories view**:
The Stories tab beside the Layers <> Modules view. It renders the Story tree
as navigable documentation the moment it loads, and attaches Story reports to
their Stories as a Stories run streams them in.

**Stories run**:
Executing Stories sequentially, depth-first, yielding one Story report per
Story as it completes. A run covers the whole Story tree or one scoped
subtree — a Story Group or a single Story. Rerunning replaces exactly the
Story reports the run covers.

**Project**:
The analysis universe anchored by one Config. All configured paths are
relative to the folder that contains that Config.

**Config**:
The declared Source roots, Ignored paths, Layers, Configured Modules, and
LayerGraphs for one Project.

**Target architecture**:
The intended dependency and encapsulation policy that a Config enforces.
Observed imports are evidence to inspect, not permissions to preserve.

**Config validation issue**:
An invalid or contradictory declaration in a Config that prevents an
Architecture Analysis. Unlike a Layer or Module violation, it is not a finding
about supported source files.

**Source root**:
A configured canonical project-relative file or folder that defines the
complete static analysis universe. Only supported source files beneath source
roots that are not explicitly ignored participate in rules or coverage; Git
state has no bearing on membership.

**Ignored path**:
A configured literal, canonical project-relative file or folder explicitly
excluded from the analysis universe. A folder includes its entire subtree.
Ignoring is the intentional way to exempt supported files beneath a Source
root from Layer and Module membership and architectural enforcement.

**Layer**:
A dependency-policy cohort: source with one architectural role and therefore
one set of cross-Layer dependency permissions. Layers partition the analysis
universe; folder names, team ownership, and visualization alone do not define
one.

**Layer scope**:
A configured canonical project-relative file or folder assigned to a Layer. A
folder scope includes its supported descendant files, and a Layer may have one
or more non-overlapping scopes.
_Avoid_: Layer folder, Layer file tree

**Module**:
An encapsulation boundary around one cohesive responsibility whose internals
change together and whose consumers use deliberate public entry points. A
Module is backed by either a directory or one supported source file.

**Module independence**:
The intended relationship between Configured Modules in one Layer: each owns
its responsibility without depending on its peers. An exceptional common
capability that cannot belong to one peer may become a Shared Module.

**Directory Module**:
A Module backed by a directory. A Normal or Shared Directory Module exposes a
minimal root `index.ts` and may add tree-shaking Subpaths; an Entry Directory
Module follows its host's file convention and exposes no Module entry point.

**File Module**:
A Module backed by one supported source file. Its file is always its public
entry point when Normal or Shared and is host-owned when Entry. It cannot expose
Subpaths or own companion files; a File Module with private companion files is
promoted to a Directory Module.

**Configured Module**:
A Module explicitly listed in `modules` that forms one disjoint membership and
dependency boundary within a Layer. Every included file belongs to one
Configured Module. Its path must identify an included supported source file or
a directory that contains included supported source files.

**Module kind**:
A Configured Module's declared access rule: Normal, Shared, or Entry. Normal is
the default.

**Module shape**:
The source form backing a Module: File or Directory.

**Normal Module**:
A Module available through its public entry points to permitted consumers in
other Layers. Its peers in the same Layer remain independent from it.

**Module public entry point**:
The smallest stable contract through which a Module exposes itself to other
Configured Modules: a Normal or Shared File Module's own file, a Normal or
Shared Directory Module's root `index.ts`, or one of its Subpaths.

**Entry Module**:
A host-started Module, such as a CLI or framework entry, that may depend on
other Modules but cannot be depended on by any Module. It may be file- or
directory-backed, follows its host's file convention, and has no Subpaths.
_Avoid_: Unexposed Module

**Observed Module kind**:
A Module's position in the observed dependency graph: Regular, Root, Terminal,
or Isolated. It describes imports found in source, not the configured Module
kind.

**Regular Module**:
A Module with both dependencies and dependents.

**Root Module**:
A Module with dependencies and no dependents.
_Avoid_: Module root, root entry point

**Terminal Module**:
A Module with dependents and no dependencies.

**Isolated Module**:
A Module with no dependencies or dependents.

**Subpath**:
An extra public `index.ts` at an exact path inside a Normal or Shared Directory
Module, added only for a proven tree-shaking need. It is another door into the
same Module, not a child Module or a new dependency policy.
_Avoid_: Nested public entry point, Nested Module, submodule

**Module internal dependency**:
An import within one Configured Module. It may target any internal file without
using a public entry point.

**External Module dependency**:
An import between Configured Modules. It requires dependency permission and an
exposed Module public entry point.

**Architecture Analysis**:
The complete renderer-neutral description of one Project's declared Layer and
Module architecture and the facts found in its supported source files. CLI
reports and visualizations are separate views of this analysis.
_Avoid_: Architecture Snapshot

**Module analysis**:
The part of an Architecture Analysis that combines the declared Configured
Module architecture with facts derived from supported source files, including
Module kind, shape, observed kind, membership, public entry points,
dependencies, and Module violations.

**Layers <> Modules view**:
The single unified view of one Project's declared and observed architecture:
Modules rendered within their Layers. Modules may be hidden to show Layers
alone, and Layer connections may be shown or hidden, at either granularity.
There is no separate Layers-only or Modules-only screen and no navigation
between granularities — only these two view settings.
_Avoid_: Layers screen, Modules screen

**LayerGraph selection**:
A focus on one LayerGraph within the Layers <> Modules view. The Layers
referenced by the selected LayerGraph's Rules are emphasized; every other
Layer and its Modules are de-emphasized yet remain visible and fully
interactive. Only the selected LayerGraph's Rules are drawn or used for
highlighting. LayerGraphs reference Layers, never other LayerGraphs.

**Module source explorer**:
A view of the included supported source files assigned to one Configured
Module, through which a user can navigate and read that Module's source.
_Avoid_: Module dialog, Module view

**Module source snapshot**:
The paths and textual contents of the included supported source files assigned
to one Configured Module at the time they are requested.
_Avoid_: Module file tree

**Module coverage violation**:
An included supported file that belongs to a Layer but no Module. The file must
either be assigned to a Module or excluded from the analysis universe through
an Ignored path. Its Layer dependencies remain enforceable, but Module-level
dependency checks involving it are deferred until it has Module membership.

**Missing Module Entry Point**:
An expected public entry point that is absent: a Normal or Shared Directory
Module's root `index.ts`, or a configured Subpath's `index.ts`. Entry Modules
intentionally have no Module public entry point.
_Avoid_: Module entry-point violation, module with no entry point

**Module cycle violation**:
A dependency cycle containing two or more configured Modules. Cycles wholly
inside one Module are not Module violations. Only otherwise permitted
cross-Module dependencies participate; LayerGraph acyclicity prevents such a
cycle from crossing Layers.

**Module dependency violation**:
A direct dependency whose target kind does not permit the source: same-Layer
dependencies require a Shared target, while Entry targets permit none. A
cross-Layer dependency to a Normal or Shared target uses Layer permission. This
violation takes precedence over checking the target's public boundary.

**Module boundary violation**:
An otherwise permitted dependency from one Module to an internal file of
another Module rather than an eligible public entry point. Layer and Module
permission failures take precedence over this violation.

**Shared Module**:
An exceptional Layer-wide capability extracted when otherwise independent
Modules genuinely need common functionality that none of them should own.
Every other Module in the same Layer may depend on it. Shared kind has no effect
on cross-Layer permission, which remains governed by Layer Rules. A Shared
Module with no same-Layer dependents is a Module violation.

**LayerGraph**:
A named, configured set of Rules representing one responsibility (e.g. core
architecture, test boundaries) — an organizational and visual grouping, not an
enforcement boundary. A LayerGraph may reference any subset of the project's
Layers; a Layer absent from a given LayerGraph simply has no rules declared
under that responsibility. Enforcement never scopes to a single LayerGraph:
the permission set actually enforced is the union of every Rule declared
across every LayerGraph in the project. All layer operations use this union,
not an individual LayerGraph. The union must be acyclic; a cycle makes the
configuration invalid even when its edges come from different LayerGraphs.
Having no LayerGraphs or Rules is valid and produces an empty permission
union, denying every cross-Layer dependency.

**Rule** (within a LayerGraph):
A direct, declared permission: Layer X may depend on Layer Y. Rules are
default-deny — a dependency between two Layers with no declared path between
them (direct or transitive, across the union of all LayerGraphs) is a
violation. Permission is transitive: if X may depend on Y and Y may depend on
Z, X may also depend on Z, without X → Z being declared explicitly. A Layer
with no outgoing rule is a valid, intentional leaf, not a configuration gap.
The union of all Rules forms a directed acyclic hierarchy: lower Layers may
depend on reachable Layers below them, while unrelated Layers may not depend
on one another.

**Layer analysis**:
The part of an Architecture Analysis that combines the declared Layer
architecture with facts derived from supported source files, including file
counts and Layer violations.

**Layer dependency violation**:
A direct file import that crosses Layers without a direct or transitively
reachable Rule permitting that Layer dependency. Violations identify only the
concrete direct import to change, not its downstream transitive consequences.

**Layer violation pair**:
An ordered source Layer and target Layer associated with one or more Layer
dependency violations. It groups the concrete forbidden imports between those
Layers for presentation.
_Avoid_: Layer group

**Layer coverage violation**:
A supported file in the analysis universe that belongs to no Layer. Because it
has no Layer identity, its imports produce no Layer dependency violations;
dependency enforcement begins once the file is assigned.

**Layer without Modules violation**:
A declared Layer that contains no Configured Modules. Every Layer must contain
at least one Module boundary.

**FileGraph**:
The raw file-dependency graph produced by cruising a project: for every
supported file in the analysis universe, the set of included source files it
directly imports. This is the single source of truth all dependency
inspections are computed from — it is never presented to a user directly.

**Inspection**:
A focused view of one exact included supported source file or Configured
Module, combining its architectural identity with its observed dependencies.
Folders that are not Configured Modules are not inspection targets.
_Avoid_: Dependency query

**Inspection target**:
The exact included supported source file or Configured Module an Inspection
describes. A Configured Module is identified by its canonical configured path.

**Direct file dependency**:
In a file Inspection, an included supported source file imported directly by
the target file — one hop.

**Recursive file dependency**:
In a file Inspection, an included supported source file reached transitively
through another dependency — two or more hops from the target file.

**Module dependent** (in an Inspection):
A Configured Module that directly depends on the inspected Configured Module.

**Module dependency** (in an Inspection):
A Configured Module that the inspected Configured Module directly depends on.

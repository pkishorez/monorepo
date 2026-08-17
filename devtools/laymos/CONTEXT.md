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
The declared Source roots, Ignored paths, optional Stories path, Layers,
Configured Modules, Module Graphs, and LayerGraphs for one Project.

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
An encapsulation boundary around one coherent capability and the design
decisions it hides. Its stable door says what callers can do; its interior
changes together without making callers learn how the promise is fulfilled.

**Deep Module**:
A Module that absorbs substantially more complexity than its door exposes. A
narrow door is insufficient when the interior remains tangled or unreadable.

**Module execution story**:
The top-to-bottom account in a Directory Module's `<name>.ts` that fulfils its
door by coordinating a few named collaborators. Each collaborator is another
zoom level, so understanding one branch never requires sibling internals.

**Module focus budget**:
The default limit of two or three concepts a reader must hold at one orchestration
level. A coordinator exceeding the budget groups related work behind a named
internal capability rather than presenting every detail at once.

**Orchestrator**:
A relative Module role that fulfils a broader capability by coordinating lower
capabilities. It owns the workflow's sequencing, failure, and state policy while
delegating the work each lower Module promises; it is not a configured kind or
a mandatory Layer.

**Module independence**:
The intended relationship between Configured Modules in one Layer: each owns
its responsibility without depending on its peers. An exceptional common
capability that cannot belong to one peer may become a Shared Module. Peers
that genuinely form one capability with an interior become a Module Graph,
where their connections are declared as Module Graph Rules instead.

**Directory Module**:
A Module backed by a directory. It has a minimal root `index.ts` when it is
Shared, exposed, or a Module Graph member. A free-form Directory Module
importable by nobody needs no door and follows its host's file convention.

**File Module**:
A Module backed by one supported source file. Its file is its public entry point
when it is Shared or exposed, and is host-owned otherwise. It cannot own
companion files; a File Module with private companion files is promoted to a
Directory Module. A File Module at a Module Graph's root is how that Graph
offers a single facade alongside its other doors.

**Configured Module**:
A Module explicitly declared, either free-form in its Layer or as a member of one
Module Graph, that forms one disjoint membership and dependency boundary within
a Layer. It is declared in exactly one of those two places. Every included file
belongs to one Configured Module. Its path must identify an included supported
source file or a directory that contains included supported source files.

**Module visibility**:
A Configured Module's declared access rule, expressed as two independent
booleans: `shared`, meaning peers in the same Layer may import it, and
`exposed`, meaning other Layers may import it. Both default to false, so a
Module is importable by nobody until it says otherwise. They mean the same
thing wherever a Module is declared.
_Avoid_: Module kind, Normal Module, Entry Module

**Module shape**:
The source form backing a Module: File or Directory.

**Exposed Module**:
A Module available through its public entry point to permitted consumers in
other Layers. Its peers in the same Layer remain independent from it unless it
is also Shared.

**Module public entry point**:
The smallest stable contract through which a Module exposes itself to other
Configured Modules: a File Module's own file, or a Directory Module's root
`index.ts`. Shared and exposed Modules have one; every Module Graph member also
has one so permitted peers use its door without making it externally exposed.

**Intentional root**:
A host-started Module, such as a CLI or framework entry, that may depend on
other Modules but is imported by none. It is neither Shared nor exposed, and is
not declared: a Module with no importers is treated as intentional when its
Layer has no inbound Rules in the permission union, because that is where hosts
enter, and is reported as a Dead Module anywhere else.
_Avoid_: Entry Module, Unexposed Module

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

**Module Graph**:
A named, bounded set of Configured Modules inside one Layer, rooted at a
directory, whose connections are declared as Module Graph Rules. It describes
one capability too large for a single Module. Normally one facade is exposed
and every private member lies on its dependency story; several doors are an
exception for independently consumed variants of the same capability. A Module
Graph is not itself a Module, owns no files directly, and cannot contain another
Module Graph.
_Avoid_: treating a Module Graph as a view of a LayerGraph. Unlike a LayerGraph
it is a disjoint unit whose Rules are never unioned with any other Graph's, are
not transitive, and are checked for cycles on their own.

**Module Graph member**:
A Configured Module declared inside a Module Graph, at a path below the Graph's
root and keyed relative to it. A member may be exposed but never Shared, since
sharing is Layer-wide and would let a peer bypass the Graph's Rules; a
capability that must be shared is declared free-form in the Layer instead. A
Module Graph declares at least two members and at least one exposed member.

**Module Graph Rule**:
A direct, declared permission between two members of one Module Graph: member X
may depend on member Y. Rules are the only means of connection inside a Graph.
They are not transitive, so a permitted chain grants nothing beyond its declared
edges, and the Rules of one Graph must be acyclic.

**Module Graph import law**:
What a member may depend on: members of its own Module Graph where a Rule
permits, free-form Shared Modules in its Layer, and exposed Modules in Layers it
may reach. Never a member of another Module Graph in the same Layer.

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
Module visibility, shape, observed kind, Module Graph membership, public entry
points, dependencies, and Module violations.

**Layers <> Modules view**:
The single unified view of one Project's declared and observed architecture:
Modules rendered within their Layers. There is no separate Layers-only or
Modules-only screen and no navigation between granularities — only View
settings.
_Avoid_: Layers screen, Modules screen

**View settings**:
What the Layers <> Modules view draws, chosen together rather than one control
each: whether Modules are shown at all, whether Layer connections are drawn,
whether Module connections are drawn, and LayerGraph isolation. They change
drawing only, never the Config, the Rules, the Violations, or coverage. A
setting whose subject is not selected yet stays available and simply has no
effect; nothing is disabled for lack of a selection.

**Connection visibility**:
A View setting, held separately for Layer connections and Module connections,
that decides whether connections are drawn while nothing is selected. Turning
one off is a request for less standing detail, not for less information: the
connections of whatever the user selects are still drawn, so a selection always
answers what it depends on.

**Host LayerGraph**:
The single LayerGraph a Layer belongs to and the only place that Layer is drawn,
derived from the Config rather than declared. It is the LayerGraph that declares the most Rules from that Layer.
A Layer no LayerGraph declares Rules from — a leaf — is hosted by the
LayerGraph declaring the most Rules into it. Ties break on declaration order,
so every Layer has exactly one Host LayerGraph and is drawn in one place. A
LayerGraph that hosts no Layer draws no lane and cannot be selected; its Rules
are still enforced and still drawn between the Layers they name.
_Avoid_: saying a Layer is shared between LayerGraphs, spanning it across them,
or standing a placeholder for it in a lane that only reaches it; a Rule points
at the one real Layer wherever that Layer is drawn.

**LayerGraph selection**:
A focus on one LayerGraph within the Layers <> Modules view. The Layers the
selected LayerGraph hosts _and_ the Layers it reaches are emphasized, so its
dependencies stay legible in the lanes that host them; every other Layer and
its Modules are de-emphasized yet remain visible and fully interactive. Only the selected LayerGraph's Rules are drawn or used for
highlighting. LayerGraphs reference Layers, never other LayerGraphs.

**LayerGraph isolation**:
An opt-in setting on a LayerGraph selection that hides everything the selected
LayerGraph does not depend on. Every other LayerGraph keeps only the Layers the
selection reaches, and a LayerGraph it reaches nothing in disappears, so the
remaining lanes sit next to each other and the distance between a LayerGraph
and its dependencies collapses. Nothing an isolated view still draws is
de-emphasized, and the Layers the selection reaches are marked as its
dependencies. _Avoid_: treating isolation as a filter on the Config or on enforcement; it
hides drawing, never Rules, Violations, or coverage.

**Layer rank stack**:
The vertical arrangement of a Layer's contents in the Layers <> Modules view: a
Configured Module or a Module Graph sits below everything that depends on it.
The stack is derived from observed imports that the Config permits — a Module
dependency violation moves nothing, because it would draw an illegal
arrangement as though it were intended. Depth is therefore a fact about the
Layer and cannot be compressed; width is free, so a rank wraps onto more lines
until the Layer is as near to square as its ranks allow. A Layer whose Modules
import nothing from each other is one rank, wrapped.
The imports the stack is derived from are drawn, because position alone cannot
say whether a box sits lower through a dependency or through a wrapped rank.
_Avoid_: calling the stack a Rule, a permission, or a Module Graph; free-form
Modules declare nothing about each other inside a Layer.

**Module source explorer**:
A view of the included supported source files assigned to one Configured
Module, through which a user can navigate and read that Module's source.
_Avoid_: Module dialog, Module view

**Module source snapshot**:
The paths and textual contents of the included supported source files assigned
to one Configured Module at the time they are requested.
_Avoid_: Module file tree

**Module Graph coverage violation**:
An included supported file below a Module Graph's root that belongs to no
member. Everything under the root must be claimed, so the only files legal
beside the member directories are those of a declared root File Module.

**Dead Module violation**:
A Module that nothing may import and nothing does: a member named in no Module
Graph Rule and not exposed, or a free-form Module that is neither Shared nor
exposed, has no importers, and is not an Intentional root.

**Module coverage violation**:
An included supported file that belongs to a Layer but no Module. The file must
either be assigned to a Module or excluded from the analysis universe through
an Ignored path. Its Layer dependencies remain enforceable, but Module-level
dependency checks involving it are deferred until it has Module membership.

**Missing Module Entry Point**:
An expected public entry point that is absent: the root `index.ts` of a
Directory Module that is Shared or exposed. A Module that is neither
intentionally has no Module public entry point.
_Avoid_: Module entry-point violation, module with no entry point

**Module cycle violation**:
A dependency cycle containing two or more configured Modules. Cycles wholly
inside one Module are not Module violations. Only otherwise permitted
cross-Module dependencies participate; LayerGraph acyclicity prevents such a
cycle from crossing Layers, and each Module Graph's Rules are checked for cycles
on their own rather than unioned with any other Graph's.

**Module dependency violation**:
A direct dependency whose target's visibility does not permit the source:
same-Layer dependencies require a Shared target, cross-Layer dependencies
require an exposed target and Layer permission, and a target that is neither
permits none. Between members of one Module Graph a declared Rule is required
instead; a dependency into another Module Graph's member in the same Layer is
never permitted. Cross-Layer access follows exposure and Layer permission.
This violation takes precedence over checking the target's public boundary.

**Module boundary violation**:
An otherwise permitted dependency from one Module to an internal file of
another Module rather than an eligible public entry point. Layer and Module
permission failures take precedence over this violation.

**Shared Module**:
An exceptional Layer-wide capability extracted when otherwise independent
Modules genuinely need common functionality that none of them should own. Every
other Module in the same Layer may depend on it, including Module Graph members,
which makes it the only common ground two Module Graphs may share. It is always
free-form and never a Module Graph member. Sharing has no effect on cross-Layer
permission, which remains governed by Layer Rules and the `exposed` flag. A
Shared Module with no same-Layer dependents is a Module violation, and one whose
dependents are all peers in its own Layer is a Module Graph waiting to be
declared.

**LayerGraph**:
A named, configured set of Rules representing one responsibility (e.g. core
architecture, test boundaries) — an organizational and visual grouping, not an
enforcement boundary. A LayerGraph may reference any subset of the project's
Layers; a Layer absent from a given LayerGraph simply has no rules declared
under that responsibility. A LayerGraph _hosts_ the Layers it declares Rules
from and _reaches_ the Layers it names only as Rule targets; reaching is not
hosting, and a Layer belongs to exactly one Host LayerGraph. Enforcement never scopes to a single LayerGraph:
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

**Base ref**:
The git revision a Change set is measured against. `HEAD` yields the Project's
uncommitted changes; a branch resolves to its merge-base with the working tree
so unrelated commits on that branch are not attributed to the current work.

**Change set**:
The added and modified paths between a Base ref and the working tree, resolved
relative to the Config's folder. Deletions and renames are outside it by
choice: a rename reads as an addition, and a path that only disappeared leaves
no trace. It decorates an Architecture Analysis and never alters the analysis
universe — Source roots and Ignored paths still decide membership, exactly as
when no Change set is present. It is unfiltered: it carries every changed path
beneath the Config's folder, and each consumer selects the paths it cares
about.

**Change status**:
One path's standing in a Change set: added or modified.

**Change origin**:
Where one path's change lives: committed between the Base ref and `HEAD`,
uncommitted in the working tree, or both when a path carries each. It lets a
reader hide uncommitted work without recomputing the Change set.

**Module change status**:
A Configured Module's derived standing in a Change set: added when every file
it owns is added, modified when any file it owns is added or modified, and
otherwise unchanged. A Module whose only change is a deleted file reads as
unchanged, because a Change set does not carry deletions.

**Story change status**:
A Story's derived standing in a Change set, resolved through the file backing
it: added when its Story file is added, modified when its Story file or the
Support file its proofs import is modified, and otherwise unchanged. A support
change is recorded as such, so a reader can tell a Story's own edit from an
edit beneath it. Resolution is per file, so Stories sharing one file share one
status. A Story Group is added when every descendant Story is added and
modified when any descendant Story changed.

**Diff hunk**:
One contiguous changed region of a modified path between a Base ref and the
working tree, carrying its lines already classified as context, added, or
removed and numbered in the side of the file each belongs to. Hunks are parsed
where git runs, so renderers never read patch text.

# CONTEXT — laymos

Glossary for laymos: layers, modules, and tests — declared intent and actual
state, merged. Definitions only; no implementation detail.

## Language

_Being redefined from scratch._

**Story**:
One idea about the Project, told to its Reader in plain, conversational
English: what they get, why it matters to them, and which parts make it up.
Each part is a Story of its own, so Stories form a tree that teaches the
Project from its pitch down to its edge cases. A Story is proved by the
Proofs that sit directly in it; at the top of the tree they prove the parts
work together end to end, deeper down they prove one part's own claims. A
Story is a folder beneath the Stories path; its Telling sits in that folder,
its sub-Stories are the folders inside.
_Avoid_: chapter, cluster, group, section, page, docs

**Telling**:
What a Story says, written as markdown in its folder: a title, a one-line
pitch, and the rest of the explanation. The Telling always speaks from the
Reader's side: what they want to do and what the Project does for them, never
how it is built. A Telling names each of its sub-Stories where it explains how
that part fits, and the order it names them is the order they are shown; a
sub-Story the Telling never names is an error.
_Avoid_: description, docs, README, summary

**Reader**:
The person a Story speaks to: whoever uses the idea that Story is about. The
Reader shifts down the tree: the top Story of a toolkit speaks to someone
choosing whether to use the toolkit, a Story about one part speaks to someone
using that part.
_Avoid_: audience, user, persona

**Proof**:
One claim backing the Story it sits in, living in one file of its own: given a
Preparation, when an Action is performed, a Verification holds. A Proof has
a title, a Venue, optionally the Critical mark, and the three phases as
executable programs. A run of a Proof yields one Proof report: a verdict
plus Evidence a reader can judge for themselves. There is one kind of Proof;
what varies is how real its Preparation is, its Venue, and what its
Verification reads.
_Avoid_: test, spec, scenario, question

**Self-contained**:
The rule every Proof file obeys: a reader opens the file and sees everything
that makes the claim true. A Proof imports only what the Project ships and
the Proof utilities; nothing it needs is hidden in a shared helper.
_Avoid_: support file, fixture file, helpers

**Preparation**:
The first phase of a Proof: the state the Proof starts from, built only from
Layers the Project ships. A Preparation may assert, and its outcome is
reported on its own, so a Verification is never read against a state that
was not reached.
_Avoid_: setup, fixture, mock, given

**Action**:
The second phase of a Proof: what is done to the prepared state. In the
Browser Venue it is the named steps a user takes on the page.
_Avoid_: when, interaction

**Verification**:
The third phase of a Proof: the Proof assertions that decide the verdict. A
Verification reads values the phases returned or measurements taken from the
Evidence; a performance claim is a Verification with a budget, not a
different kind of Proof.
_Avoid_: then, expectation, check

**Venue**:
Where a Proof runs, which decides what Evidence its run can capture. Process:
in the runner's own process, yielding values and a trace. Browser: the real
app in a real browser, adding video and screenshots.
_Avoid_: tier, unit, integration, e2e, environment

**Device**:
In the Browser Venue, one browser with its own storage, shaped as a desktop
or a phone. Two Devices share nothing, so they stand for two users or two
machines. A Proof opens as many as its claim needs.
_Avoid_: context, profile, browser instance

**Tab**:
One open page on a Device. Tabs on the same Device share storage, so two Tabs
stand for a user with the app open twice. Every Tab has its own Recording on
the Proof's one clock, so all of a Proof's Recordings line up in time.
_Avoid_: page, window

**Recording**:
What a Tab's screen did during a Proof run, kept raw: every frame the screen
produced, each with the moment it appeared, untrimmed. The Stories canvas
plays Recordings back at their own timestamps, side by side when a Proof has
several Tabs, with Steps, fingers, and sounds drawn over them at playback.
_Avoid_: video, screencast, capture

**Step**:
One named move of an Action in the Browser Venue, performed on one Tab: open,
click, type, scroll, close, or a Gesture. A Step is recorded with its name, its Tab,
and the moment it happened, so the Stories canvas can mark it on the video.
Steps are performed the way a person would see them: the pointer travels,
scrolling glides, and nothing jumps.
_Avoid_: command, interaction, event

**Gesture**:
A Step made with one or more fingers on a phone Device: tap, press, swipe,
drag, pinch, rotate. Each finger moves along its own path over time, the way
a hand does, and each is drawn in the video while it is down.
_Avoid_: touch event, multi-touch, pointer sequence

**Evidence**:
What a Proof run captured that a reader can inspect: the value each phase
returned, a trace of what the code did, and in the Browser Venue one
Recording per Tab. The verdict says it passed; the Evidence shows what
happened.
_Avoid_: artifact, recording, section

**Critical**:
The one mark a Proof can carry: a failure here is dangerous, so the Proof is
shown apart and its failure is reported before everything else. It changes
how a Proof is shown and reported, never what it is.
_Avoid_: priority, tag, marker, severity

**Story tree**:
The Stories of a Project, from its top Story down, each with its Telling,
its Proofs, and its sub-Stories. Loading it is metadata-only: no Proof
executes.

**Story id**:
A Story's place in the Story tree, written as the names from the top Story
down: `std-toolkit/evolving-schema/migrations`. A Telling refers to another
Story by its Story id, and a reference to a Story that does not exist is
shown as broken where it appears.

**Proof id**:
The Story id of the Story a Proof sits in plus the Proof's own name. It is
what a Proof report attaches to and what a run is scoped by.

**Proof assertion**:
A mandatory description paired with a boolean condition, declared inside a
Proof's phases and recorded when the run reaches it. Outcomes decide the
verdict: unprepared when a Preparation assertion was false or the Preparation
died, failed when a Verification assertion was false, errored when a phase
died, passed otherwise.

**Proof context**:
The service the Proof runner injects into every Proof run. It receives every
captured Evidence and Proof assertion outcome and yields the Proof report.
Proof utilities are the only way Proofs talk to it.

**Proof report**:
The record of one Proof run, attached to the Story tree by Proof id: the
verdict per phase plus the Evidence the run captured. A Proof has one report
at a time; a rerun replaces it.

**Stories path**:
A configured project-relative folder holding the Story tree. It is
implicitly an Ignored path: Proofs are exempt from architectural
enforcement.

**Stories canvas**:
The view of a Project's Story tree, read like documentation: the top Story
first, and opening a Story reveals its Telling in place with its sub-Stories
beside it. A Story's Proofs are listed inside it, under its Telling, like
footnotes. Proofs run singly, by Story, or all at once. Opening a Proof
shows its file and its whole Proof report in one place.
_Avoid_: Proofs view, sidebar, list

**Stories run**:
Executing the Proofs in a scope, the whole tree, one Story and everything
beneath it, or one Proof,
yielding one Proof report per Proof as it completes and replacing the report
each covered Proof had before.

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

**Unanalyzed file**:
A file git knows beneath a Laymos scope that lies outside the analysis
universe: an unsupported file, or one beneath an Ignored path. It is shown
beside analyzed files for context but never owned by a Layer or Module, so its
changes never alter a Module change status.
_Avoid_: untracked file (git's word for a file not yet added)

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
A Proof's derived standing in a Change set: added when its file is added,
modified when its file is modified, and otherwise unchanged. A Story is added
when its Telling and everything beneath it are added, and modified when its
Telling or anything beneath it changed.

**Diff hunk**:
One contiguous changed region of a modified path between a Base ref and the
working tree, carrying its lines already classified as context, added, or
removed and numbered in the side of the file each belongs to. Hunks are parsed
where git runs, so renderers never read patch text.

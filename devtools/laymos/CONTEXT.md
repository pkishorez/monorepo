# CONTEXT — laymos

Glossary for laymos: Modules, Rules, Exceptions and Stories — declared intent
and actual state, merged. Definitions only; no implementation detail.

## Language

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
Modules the Project ships. A Preparation may assert, and its outcome is
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
The declared Source roots, Ignored paths, optional Stories path, File
Modules, Rules and Exceptions for one Project. Folder Modules are never
listed; they are read from disk. The Config states intent; source code is
evidence.

**Source root**:
A configured project-relative file or folder that defines the analysis
universe. Files beneath Source roots, minus Ignored paths, are what Rules and
Exceptions are checked against. Git-ignored files are never part of it.

**Ignored path**:
A configured file or folder removed from the analysis universe, with its
whole subtree. Ignoring is the one way to keep a folder with an `index.ts`
from being a Module, and to say a loose file beside Modules is no Module.
An ignored file still shows in the File list, dimmed.

**Unanalyzed file**:
A file git knows beneath a Source root that lies outside the analysis
universe: unsupported, or beneath an Ignored path. Shown dimmed in the File
list, never owned by a Module.
_Avoid_: untracked file (git's word), git-ignored file (never shown at all)

**Module**:
One unit of the architecture: a folder with an `index.ts`, read from disk, or
a single file declared as a File Module. Inside a Module its own files are
free among themselves, and tests inside it are inside it. To everything
outside, a Module is an island whose only importable file is its Index. A
folder with an `index.ts` that should not be a Module is an Ignored path.
_Avoid_: layer, module graph, package, deep module (that is a quality a
Module has, not a kind), configured module, directory module, declared module

**Index**:
A folder Module's `index.ts`: the one file of that Module anyone outside may
import. It only exports; the Module's own files do the importing. An Index
says nothing about the Modules nested below it, which have their own.
_Avoid_: door (the monorepo's word for a Toolkit subpath), entry point,
barrel, public entry, facade, seal

**File Module**:
A single file declared in the Config as a Module of its own. The one kind of
Module that must be declared, because a file carries no `index.ts` to say so.
_Avoid_: file-level module, leaf file

**Own files**:
The files of a folder Module that are not inside a Nested Module. They may
import each other, and the Index of any Module nested below them at any
depth, for free.

**Nested Module**:
A Module that lives inside another Module. It is an island to its siblings
and to the outside: only the Own files of the Modules above it may import its
Index for free. A Rule may name it from anywhere, as narrowly as it likes.
_Avoid_: sub-module, child module, member, inside

**Wrapper**:
A folder that holds Modules and is named in Rules for all of them at once. A
folder with no `index.ts` is a plain Wrapper: it has no face, nobody imports
it, and it should have no files of its own. A Module that holds Nested
Modules is also the Wrapper of those Modules.
_Avoid_: layer, group, namespace, structural folder, scope

**Exposed Module**:
A Module inside a Wrapper that something outside that Wrapper imports. What
it exposes is read from the code, never declared.
_Avoid_: public module, shared module, port

**Internal Module**:
A Module inside a Wrapper that nothing outside that Wrapper imports: only its
neighbours in the Wrapper use it. The healthy default.
_Avoid_: private module, hidden module

**Wrapper coverage finding**:
A plain Wrapper that holds loose files. Each such file must become a file
Module, the Wrapper must become a Module by gaining an Index, or the file must
be an Ignored path.
_Avoid_: layer coverage violation, unassigned file

**Rule**:
A declared, one-way permission between two project-relative paths, each a
Wrapper or a Module at any depth: every Module inside _from_ may import the
Index of every Module inside _to_. Rules are the architecture. By default no
Module imports any other, so a sibling import with no Rule is a violation. A
Rule is as narrow as the need: `src/studio-rpc -> src/db/std-table/definition`
grants one nested Module and nothing else of `db`; `src/sync -> src/db`
grants all of it. Rules do not chain. A Rule says _may_, never _should_;
which Modules use it is read from the code.
_Avoid_: layer rule, module graph rule, dependency, edge, permission,
guideline, business rule, exception

**Shared Rule**:
A Rule whose _from_ is every sibling of _to_, written `*`. The one place a
Module is granted to all its peers at once.
_Avoid_: shared module, shared flag

**Rule loop**:
A set of Rules that, followed together with folder nesting, lets a Module
reach itself. A Config error, not a violation.
_Avoid_: cycle (used for observed imports), circular dependency

**Exception**:
One declared import that no Rule could ever hold, allowed on purpose, with a
Reason. Only two things are Exceptions: a child importing its parent or any
ancestor, and an import against an existing Rule that would make a Rule loop.
Anything else that is wanted is a Rule. An Exception is outside the loop check
and drawn apart from Rules, with its Reason beside it. One without a Reason
is invalid.
_Avoid_: override, allowlist, waiver, exemption, granular rule

**Reason**:
The sentence an Exception carries saying why it exists. Mandatory.
_Avoid_: comment, note, justification

**Violation**:
One observed import that is not inside a Module, not a parent importing a
child's Index, not covered by a Rule, and not covered by an Exception. There
is one kind; the report names the two files and says whether a Rule could
hold it or only an Exception.
_Avoid_: layer dependency violation, module boundary violation, module
dependency violation, module cycle violation, dead module, missing entry point

**Reach**:
Everything a Module may import, by Rule and Exception, inherited from every
Wrapper above it. Reach is what a Rule grants; use is what the code shows.
_Avoid_: permission union, transitive reach, visibility

**Architecture Analysis**:
The merged picture of one Project: the Module tree the Config declares, the
Rules and Exceptions on it, and every observed import classified against
them.

**Module rank**:
Where a Module stands among its siblings in the picture, below the siblings
that import it. Derived from Rules where the Wrapper has them and from
observed imports where it has none, never declared.
_Avoid_: layer, stratum, level, depth

**Laymo**:
The picture of a Project's architecture, shown beside Stories: an explorable
space of cards, one per Module or Wrapper. The Project is one card holding
its children; a card opens in place to show what is nested in it and
collapses back; a Wrapper chain with one child shows as one card named by the
whole path. A card carries only its name, and inside a Wrapper whether it is
an Exposed or an Internal Module. Lines are the imports the code makes, never
the Rules; a Violation is red. Lines join siblings, so no line crosses a
card's border; a selected card shows instead only what crosses its border,
one line from its own frame to each card it uses or is used by.
_Avoid_: layers <> modules view, graph view, architecture view, module
canvas, architecture explorer

**Module outline**:
The Project's Wrappers and Modules as one collapsible tree beside the Laymo,
stopping at Modules: no files. Selecting in either selects in both.
_Avoid_: file tree, file list (that is a Module's files), navigator

**Rule list**:
Every Rule and Exception of the Config, listed beside the Laymo under the
Module outline. Choosing one shows it on the Laymo.
_Avoid_: rules panel, legend

**File list**:
Every git-tracked file of a Module's folder, shown as one plain tree with
nothing hidden: source, README, docs, tests and ignored files alike, ignored
ones dimmed. Git-ignored files are not in it. Opening a file shows it. There
is no separate documentation view.
_Avoid_: module source explorer, documentation, docsPath, source snapshot

**FileGraph**:
The raw file-dependency graph produced by cruising a project: for every
supported file in the analysis universe, the set of included source files it
directly imports. The single source of truth every dependency inspection is
computed from; never presented to a user directly.

**Inspection**:
A focused view of one included source file or one Module, combining its place
in the Module tree with its observed imports. Wrappers and undeclared folders
are not inspection targets.
_Avoid_: dependency query

**Inspection target**:
The exact included source file or Module an Inspection describes. A Module is
identified by its project-relative path.

**Direct file dependency**:
In a file Inspection, an included source file imported directly by the target
file: one hop.

**Recursive file dependency**:
In a file Inspection, an included source file reached through another
dependency: two or more hops.

**Module dependent** (in an Inspection):
A Module whose files directly import the inspected Module's Index.

**Module dependency** (in an Inspection):
A Module whose Index the inspected Module's files directly import.

**Base ref**:
The git revision a Change set is measured against. `HEAD` yields the Project's
uncommitted changes; a branch resolves to its merge-base with the working tree
so unrelated commits on that branch are not attributed to the current work.

**Change set**:
The added, modified and deleted paths between a Base ref and the working tree,
resolved relative to the Config's folder. Renames are outside it by choice: a
rename reads as an addition and a deletion. A path added since the Base ref
and deleted again leaves no trace. It decorates an Architecture Analysis and never alters the analysis
universe — Source roots and Ignored paths still decide membership, exactly as
when no Change set is present. It is unfiltered: it carries every changed path
beneath the Config's folder, and each consumer selects the paths it cares
about.

**Change status**:
One path's standing in a Change set: added, modified or deleted.

**Change origin**:
Where one path's change lives: committed between the Base ref and `HEAD`,
uncommitted in the working tree, or both when a path carries each. It lets a
reader hide uncommitted work without recomputing the Change set.

**Module change status**:
A Module's derived standing in a Change set: added when every file it owns is
added, deleted when its Index was deleted and its folder is no Module any
more, modified when any file it owns or once owned changed, and otherwise
unchanged. A Wrapper whose every child was deleted reads deleted too. A deleted Module is shown where it stood, so a reader sees what
the change took away.

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

# Architecture is one tree of Modules, with Rules and Exceptions

Laymos described a Project in four declared levels: LayerGraphs holding
Layers, Layers holding Modules and Module Graphs, each Module carrying two
visibility flags, and two kinds of rule that differed in transitivity, union
and cycle checking. The configs written against that model said less than they
cost. web-platform declared 28 Layers with names like `input-gesture-zones`
and `pwa-shared`, and std-toolkit 49; those are folders, not dependency jobs,
and the layer graph for each mostly restated what nesting already said. A
reader learning the model had to hold eight concepts and nine violation kinds
to answer one question: may this file import that one?

The Config now declares seven keys and the filesystem says the rest. A
**Module** is a folder with an index file, or a single file listed under
`fileModules`. A folder without an index file is a **Wrapper**, a name for
everything inside it. A Module that holds Modules is also their Wrapper. The
tree is read from disk; nothing lists folder Modules, and a folder that should
not be one is an Ignored path.

Three things are free without a word of config: files inside one Module
importing each other, a Module's own files importing the Index of any Module
nested below them, and nothing else. Every other import between Modules needs
a **Rule**: a one-way pair of paths, each a Wrapper or a Module at any depth,
granting every Module inside the source the Index of every Module inside the
target. Rules do not chain. A narrow Rule such as `src/studio-rpc ->
src/db/std-table/definition` grants one nested Module and nothing else of
`db`; `src/sync -> src/db` grants all of it. `*` as a source names every
sibling of the target, which replaces `shared`.

Two things no Rule can hold are **Exceptions**, each with a mandatory Reason:
a child importing its parent or any ancestor, and an import against a Rule
that would make a Rule loop. Nothing else is ever an Exception, and the
validator refuses an Exception a Rule could hold, so the two lists stay
honest and the short one stays visible. An import that is none of these is a
Violation, of one kind, reported with which key could hold it.

Layers survive only as a picture. Inside any card of the Laymo, siblings rank
below the siblings that import them, by Rules where the parent has them and
by observed imports where it has none. Strata are derived, never declared.

What this gives up: a Layer could group folders that sat apart on disk under
one dependency job; now the tree is the folder tree, and a job that spans
folders is a Wrapper only if those folders share a parent. Module Graphs could
describe a non-transitive interior that was private to one capability; now
that interior is Nested Modules with Rules among them, visible to the whole
Config. Both were judged a fair price for a model a reader can hold in one
hand.

This supersedes [0005](./0005-layers-form-one-default-deny-dag.md),
[0006](./0006-modules-form-disjoint-deep-boundaries.md),
[0007](./0007-modules-may-be-files-or-directories.md),
[0010](./0010-declare-module-kind-and-subpaths.md),
[0012](./0012-module-visibility-is-two-booleans.md),
[0013](./0013-module-graphs-partition-complex-layers.md),
[0014](./0014-a-layer-has-one-host-layergraph.md),
[0015](./0015-a-layer-reads-as-a-rank-stack.md) and
[0016](./0016-rules-point-at-the-real-layer.md). Every laymos.config.json in
the repository is rewritten by hand rather than migrated, because the old
configs encode the confusion this decision removes.

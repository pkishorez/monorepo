# Module Groups, a within-layer disclosure tier

A flat list of Modules stops being a picture once a Layer holds more than a
handful. The Module view already removes file-level noise, but a Layer with
twenty Modules is still twenty boxes competing for one reader's attention. The
Layer view does not have this problem: a Layer never floats alone, it lives
inside a Layer Graph, and a graph is the handful-sized bundle a reader actually
scans. Modules had no equivalent tier. Module Groups add one.

A Module Group is a named, described cluster of sibling Modules that all live in
the same Layer. It is to Modules what a Layer Graph is to Layers, scoped to a
single Layer so it nests instead of forming a second hierarchy: Layer → Group →
Module → file evidence, each level a clean collapse. Members are values already
declared in `config.modules` — the same reuse discipline Module rules follow —
so a Module is never declared twice. A Module belongs to at most one Group, so
Groups partition a Layer's Modules exactly as Layers partition files and
Modules stay a flat, disjoint set. Group edges are the module-edge aggregation
one tier up, the same rollup that already turns file edges into module edges.

Groups are purely organizational, decided in the same breath as the tier
itself. Declaring one imposes no import rule: `canImport` and `canImportedBy`
remain Module-level, and a Group carries no permission of its own. The only job
of a Group is progressive disclosure — chunking the picture so a reader holds
five clusters instead of thirty modules. Two invariants keep the nesting clean
and are configuration errors when broken: every member resolves (by longest
Layer prefix) to the **same Layer**, and a Module appears in **at most one**
Group. The same-Layer rule is what makes a Group nest under its Layer lane
rather than cut across Layers.

Consequence: the architecture report gains a `moduleGroups` registry
(`name → { description, modules }`) alongside `modules` and `moduleRules`, always
present and empty when unused. The Group's Layer is not stored; consumers infer
it from the members, the way a Module's Layer is already inferred rather than
declared. In the packed layout the frontend **collapses each Group to a single
node by default** — a crowded Layer reads as a handful of Group nodes plus any
ungrouped tiles. A reader expands a Group in place: it opens where it sits as a
**nested container** inside the Layer, holding its member tiles behind its own
header with a minimise control, rather than relocating them to a separate
section. Inside the container, members sort into seed, connective-core, and
leaf bands by their Group-internal edges, so the in-between modules read apart
from the Group's entry and exit points. Edges from a selected Module route into
a collapsed Group node and fan
out to the members once it is expanded. Configurations without Groups are
unchanged in every surface.

Considered and rejected: **nesting Modules inside Modules** — true hierarchy,
but it breaks the flat-partition invariant that longest-prefix ownership,
coverage, and rule evaluation all rely on, and it makes "which level does a
rule bind to" ambiguous. **A cross-Layer "feature" grouping** — matches the
"connected together for a feature" intent, but Layers and features are then two
hierarchies over the same Modules and the picture can show one or the other,
not both, without a matrix. A within-Layer Group is the smallest addition that
removes the flat-list overwhelm while leaving every existing invariant intact;
a cross-Layer feature tag remains additive later if the need returns.

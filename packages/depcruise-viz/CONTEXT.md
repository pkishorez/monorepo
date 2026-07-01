# CONTEXT — depcruise-viz

Glossary of domain terms for the dependency-cruiser visualization. No
implementation detail — this is a shared vocabulary, not a spec.

## Stack

A layering of layers related by explicit **parent→child** edges (a DAG), where an
ancestor layer may import any descendant, never the reverse. A linear chain (authored
with `layersTopDown`) is the special case where each layer has a single child.
Two layers that are **incomparable** — neither is an ancestor of the other
(sibling branches) — are **isolated**: neither may import the other. Roughly a
"sub-project" — one self-contained layering.

## Layer

A named band of paths within a stack. A layer's name is unique within a stack;
the same name across stacks is treated as the same layer (they share a card in
the grid).

## Module

A named unit of code living in exactly one **layer**. A module has only a name, a
layer, and a path — **no owner, no visibility** (`private`/`shared`/`public` are
retired). Within a layer, declared modules exhaustively cover every file: no file
is uncovered and no file is in two modules.

## Feature

A vertical slice of the architecture, declared as a **rooted DAG of module
references** spanning layers from a single root (the entry module, in the
top-most layer) downward. A feature does not own modules; it _references_ them.
Because layers are strictly top-down, every edge in a feature points downward, so
the DAG reads as a single-rooted tree. Membership is declarative, not inferred
from the import graph.

## Shared module

A module referenced by two or more features. Sharing is **emergent, not
configured** — there is no marker on the module; the fact that multiple feature
trees name it _is_ the sharing. A shared module is the explicit boundary where
per-feature closure relaxes: each referencing feature accounts only for the
edges to its own members.

## Barrel

A module flagged (module-level intrinsic `barrel: true`) as a re-export /
fan-out point — e.g. a controller hosting every endpoint, or an index that
re-exports many units. A barrel is **exempt from closure and coverage**: its
out-edges are not required to be claimed, and within a feature only the edges
into that feature's members are traced; the rest are ignored. This is what lets
a single shared controller be the root of many features without forcing all its
fan-out into every feature. The tradeoff: a barrel's genuinely-dead re-exports
are not flagged.

## Feature closure

The lint contract over feature trees. **(1)** A non-barrel module referenced by
exactly one feature must have all its real out-edges accounted for within that
feature — an exclusive module cannot reach outside its feature. **(2)** At a
shared module or a barrel, closure relaxes: edges are traced per-feature via the
member set. **(3)** Global coverage: every real module→module import edge must
be claimed by at least one feature, except edges leaving a barrel. An unclaimed
non-barrel edge is a violation. Reaching a module you never declared in your
tree surfaces as an unclaimed edge, which is how accidental coupling is caught
without any module-level visibility config.

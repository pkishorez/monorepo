# CONTEXT — depcruise-viz

Glossary of domain terms for the dependency-cruiser visualization. No
implementation detail — this is a shared vocabulary, not a spec.

## Stack

A single top-down layering: an ordered set of layers where an upper layer may
import the layers below it, never above. Authored with `layersTopDown`. Roughly
a "sub-project" — one self-contained ordering.

## Group

A named tier above stacks. A stack belongs to at most one group; stacks sharing
a group form one bounded, isolated unit (a sub-project family) and render inside
a single labeled region. A group is a **tag** on the stack (the `group()`
wrapper stamps it), not a container entity. Groups do not nest.

## Default group

The implicit group of every stack with no group declared. All ungrouped stacks
share this one namespace, so a layer name reused among them still merges as
before. A config that declares no groups behaves exactly as it always has.

## Layer

A named band of paths within a stack. Its identity is **(group, name)**: the
same name in two different groups denotes two distinct, isolated layers. A
layer's name is unique only within its group.

## Shared layer

A layer reused by name across stacks **within the same group**; rendered as one
node spanning those stacks' columns. Reusing the name in a different group does
not share — it is a separate layer.

## Cross-group edge

An import from a module in one group to a module in another. Groups are
isolated, so the only sanctioned crossing point is another group's **public or
shared surface** (a barrel). An import that reaches another group's **private**
internals is a cross-group violation and fails analysis at author time.

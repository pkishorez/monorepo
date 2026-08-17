# Module Graphs partition complex Layers

Modules within a Layer are flat and independent, and the only way to express one
Module depending on a peer is to mark the peer Shared. That mechanism is
Layer-wide and untargeted, so a chain of siblings is encoded as a scatter of
Shared flags, and a capability too large for one Module either fragments into
pseudo-Shared peers or hides its structure inside a single opaque Module where
Laymos cannot see it. Laymos adds the Module Graph: a named, bounded set of
Modules inside one Layer with its own declared dependency Rules.

A Module Graph declares a `path`, a `modules` map keyed relative to that path,
and `rules` over those keys. Members are co-located with their Rules, so a
Module is declared exactly once, either inside a Module Graph or free-form in
its Layer, and membership is unambiguous. Every file under the Graph's path must
belong to a member — Module Graph coverage, alongside Layer and Module coverage
— which makes the Graph folder a complete table of contents rather than a
partial one. A Graph requires at least two members and at least one exposed
member; one-member Graphs are Modules, and a Graph nobody can reach cannot mean
anything.

A member may import its own Graph's members where a Rule permits, free-form
Shared Modules in its Layer, and exposed Modules in Layers it may reach. It may
never import another Graph's members. Members may not be Shared: sharing is
Layer-wide and would let a peer bypass the Graph's Rules entirely, so anything
that must be shared belongs outside the Graph. Because the only cross-Graph
common ground is a free-form Shared Module, Graphs stay independent of one
another without forbidding shared code — a stricter rule that permitted only
downward imports was rejected because lifting a common capability out of a Graph
would have had nowhere to go except an artificial lower Layer.

Rules are the sole means of connection inside a Graph, and unlike LayerGraph
Rules they are **not transitive**: a Graph is small enough that stating each edge
is cheap, and transitivity would silently permit imports across an interior the
Graph exists to describe. Two further inversions follow from Graphs being
disjoint units rather than views: their permissions are **never unioned** the way
LayerGraph Rules are, and cycles are checked **per Graph**. The word "graph"
therefore means materially different things at the two levels, which the
glossary records explicitly.

Module Graphs do not nest. The model is exactly four levels — LayerGraph, Layer,
Module Graph, Module — which keeps the narrative fixed and every report bounded;
a Graph that wants an interior Graph is a Layer that has not been declared.
A Layer is likewise not a Module Graph: a Layer groups by architectural role and
a Graph describes how Modules work together, and giving Layers Rules over their
own Modules would force every large Layer to declare every internal edge.

Considered and rejected: declaring Module Graphs as a top-level key symmetric
with `layerGraphs`, which would have preserved the flat `modules` map but split
each Graph's declaration across two places; and deriving membership from path
containment, which avoids a second declaration site but leaves members with
nowhere to state their own visibility.

The evidence is narrow and should bound ambition. Across five projects only a
handful of Layers show Graph shape, the largest being a twelve-part, five-deep
interior currently hidden inside one Module; several of the largest Module
clusters have no internal edges at all and remain correctly flat.

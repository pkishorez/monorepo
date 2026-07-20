# Laymos Modules

`LaymosModules` is a topology-first view of the observed module graph.
Modules share one dependency DAG: layers do not create columns, ranks, or
containers and appear only as compact node metadata.

The graph uses small module nodes and connection-aware, top-down Dagre placement
to keep the whole architecture legible without consuming excessive horizontal
space. A layer with more than ten modules collapses
large path families into aggregate nodes. Aggregate edges preserve every
cross-cluster import and the cluster can be expanded in place to inspect its
modules and internal connections.

Left-click reveals a module's immediate incoming and outgoing connections.
Right-click reveals its transitive ancestors and descendants. Hover and
controlled selection use the same interaction contract as the other Laymos
module views. Hover acts as a temporary spotlight: the selected root and hovered
module remain prominent, selected edges touching the hovered module stay active,
other selected edges become half-dimmed, and unrelated edges remain fully
dimmed. Hover never adds an edge outside the selected set. The underlying
selection is restored unchanged when the pointer leaves. While a selection is
active, modules outside its highlighted node set do not respond to hover.

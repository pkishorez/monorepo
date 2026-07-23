# Laymos modules

`LaymosModules` presents the configured architecture as graph lanes containing
expandable layer containers. Each expanded layer holds a stable, rounded module
packing whose width responds to module count. Shared layers remain one
container spanning their graph lanes. Root modules use a blue tint; sink
modules use a green tint.

Module imports are hidden until a module is selected. Left-click discloses all
of its direct incoming and outgoing imports, including connections within the
same layer; right-click discloses the complete bidirectional transitive
neighborhood. Hovering a related module focuses its incident edges and updates
the compact context card.

Right-clicking a graph or layer minimises its contents without changing the
canvas layout, zoom, or selection. Left-click is reserved for module selection,
so dragging can begin anywhere on the graph. Connections into minimised layers
are aggregated at the layer boundary.

The layout control defaults to **Pack** for compact orientation.
**Tree** ranks each layer's modules top-to-bottom by their intra-layer imports
without showing module edges by default. Selecting a module discloses its
neighborhood as it does in Pack. A tree level with too many siblings becomes a
compact rounded mini-pack rather than forcing the entire layer to grow in one
direction. Tree positions and node styling remain static during selection and
hover; hover changes only the context card.

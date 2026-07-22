# Laymos Modules View 2

`LaymosModulesView2` is an alternate presentation of the same controlled
`LaymosModulesProps` contract. It keeps layers in dependency order from left to
right and renders each layer's modules as a compact file tree.

Every overview edge is an observed module import. Edges remain visible at rest,
then hover and selection bring the relevant direct or transitive paths forward.
The selected-module control switches scope without leaving the overview. While
a module is selected, hovering any connected module expands that module's
transitive downstream dependencies in place.
Module rows expose a graph button, and right-click provides the same shortcut,
to open a focused connection dialog. The dialog separates incoming consumers
from outgoing dependencies and can switch between direct and transitive scope.

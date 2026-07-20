# Laymos Modules

`LaymosModules` renders declared modules, their layer ownership, and observed
module connections from one canonical `LaymosReport`. It is a controlled,
opinionated companion to `LaymosLayers`, not a configurable graph toolkit.

## Data boundary

The report supplies declarations, classified files and imports, rules,
violations, and coverage. The block privately derives module edges,
directional reachability, shortest paths, strongly connected components, and
layout. React Flow data never crosses the public API.

Observed imports are the only source of graph connectivity. Configured module
rules classify those observations and remain visible in the context card when
unused. Files without a declared module are reported as layer coverage gaps and
module boundary evidence; they never become synthetic module nodes.

## Controlled interaction

Selection includes a connection depth:

```ts
type LaymosModuleSelection = {
  readonly path: string;
  readonly depth: 'direct' | 'transitive';
};
```

With no selection, hover and keyboard focus preview direct neighbors. Left
click selects direct connections. Right click selects transitive connections;
the visible Direct/Transitive control provides the keyboard and touch
equivalent. While selected, hover compares another module with the selected
root.

Direct mode never expands silently. Transitive mode displays a sparse
shortest-path backbone, and comparison highlights every equally short directed
route between the two modules. Pane click and Escape clear selection.

## Visual model

Layers form one compact top-to-bottom union hierarchy. Sibling layers wrap
inside their dependency rank, and shared layers render once. Modules are ranked
by observed dependencies inside their owning layer; cycles share a rank.
Geometry remains fixed through all interaction states.

The overview hides module edges. Active outgoing paths, incoming paths, and
violations reuse the semantic colors from `LaymosLayers`. Every displayed
module edge represents real direct imports, while exact file-to-file evidence
appears in the context card.

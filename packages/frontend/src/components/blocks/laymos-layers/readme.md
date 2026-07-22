# Laymos Layers

`LaymosLayers` renders configured layer permissions and observed code
connections from one canonical `LaymosReport`. It is an opinionated graph block,
not a configurable visualization toolkit.

## Data boundary

Laymos emits domain facts: normalized declarations, classified files and their
imports, violations, and coverage. This block privately derives layer-level
adjacency, transitive reduction, layout, and visual state. React
Flow nodes and edges never cross the public API.

- Configured edges render as the transitive reduction of declared permission.
- Observed edges render one exact edge per ordered layer pair found in file
  imports.
- Intra-layer imports and imports involving ignored or uncovered files do not
  produce layer edges.

## Controlled interaction

Selection, hover, and keyboard focus are independent controlled pairs. The
consumer derives the active node with:

```ts
const activeNode = selectedNode ?? hoveredNode ?? focusedNode;
```

The same state can synchronize a file tree or another surrounding view. With no
selection, hover and focus preview the complete selected state. Once a selection
exists, hover only indicates that another graph or layer can be selected.

| State        | Configured graph                                    | Observed graph                         | Other nodes   |
| ------------ | --------------------------------------------------- | -------------------------------------- | ------------- |
| Overview     | Complete reduced skeleton                           | Hidden                                 | Fully visible |
| Graph active | Selected graph emphasized                           | Internal edges and incident violations | Dimmed        |
| Layer active | Direct configured and observed neighbors emphasized | Exact incident edges and counts        | Dimmed        |

Edges are passive evidence. Only graph headers and layer nodes are hoverable,
focusable, and selectable. `Tab` traverses those buttons, `Enter` or `Space`
selects, and `Escape` clears selection.

## Visual information

Layer nodes permanently show their name, file count, understated uncovered-file
text when needed, and incident layer-violation count. Shared layers use the same
surface as every other layer; their lane-spanning geometry communicates the
relationship. A fixed contextual card shows descriptions, paths, precise
coverage, connection totals, and the legend. It is expanded by default and can
be collapsed. Set `defaultMinimise` when an embedding should
start with it collapsed.

Graph order follows the report. Vertical ranks come from the union DAG so a
shared sink has one stable position across graph lanes. Nodes are fixed; the
viewport supports pan and zoom while fitting the graph initially and on resize.

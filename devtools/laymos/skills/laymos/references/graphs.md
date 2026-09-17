# Module graphs

Read this when one capability outgrows a single module.
Read `design.md` first when deciding whether the graph is the right boundary.

## What is a module graph?

A named, bounded set of modules inside one layer, rooted at a directory,
whose connections are declared as rules. It describes one capability whose
parts need their own dependency direction — an interior the layer should not see.

A module graph is not a module. It owns no files directly, has no `index.ts`
of its own, and cannot contain another module graph.

Default to one exposed facade and a dependency path from it to every private
member. Several exposed doors are a design exception, not a config violation.

## What does it look like?

```json
"orchestrator": {
  "paths": ["src/orchestrator"],
  "moduleGraphs": {
    "project-orchestration": {
      "description": "Loads a project once and derives every view of it.",
      "path": "src/orchestrator",
      "modules": {
        "load-project": {},
        "analyze-project": { "exposed": true },
        "inspect": { "exposed": true }
      },
      "rules": {
        "analyze-project": ["load-project"],
        "inspect": ["analyze-project", "load-project"]
      }
    }
  }
}
```

Member keys are relative to `path`. Rules use those keys.

## What are the invariants?

- At least two members. A one-member graph is a module.
- At least one exposed member. A graph nobody can reach means nothing.
- Graph ids are unique across the whole project, not merely within one layer.
- Every file under `path` belongs to a member — module graph coverage.
  A file beside member directories must itself be a declared root File Module.
- No member may be `shared`. Sharing is layer-wide and would let a peer bypass
  the rules; declare anything that must be shared outside the graph.
- Rules must be acyclic, and reference only this graph's members.

## What may a member import?

Its own graph's members where a rule permits, free-form shared modules in its
layer, and exposed modules in layers it may reach. It may never import another
graph's member in the same layer.

Rules are the only way members connect, and a member no rule reaches and nothing
exposes is dead.

## How is this different from a layer graph?

Both are DAGs of nodes with declared rights, but they invert in three ways:

|              | layer graph                      | module graph                             |
| ------------ | -------------------------------- | ---------------------------------------- |
| overlap      | graphs share layers; rules union | disjoint units; never unioned            |
| transitivity | transitive                       | **not** transitive — only declared edges |
| cycles       | checked over the union           | checked per graph                        |

Non-transitivity is deliberate. A graph is small enough that stating each edge is
cheap, and transitivity would silently permit imports across the very interior
the graph exists to describe.

## When is a module graph wrong?

- The members have no edges between them → they are independent peers.
  Leave them flat.
- A member wants an interior graph of its own → it should have been a layer.
- Two graphs want to reach into each other → extract the common part up to the
  layer as a free-form shared module.
- Members mirror runtime steps but hide no independent decisions → keep the
  execution story inside one module.

# laymos.config.json

Read this when writing or amending a config.

## What does a config look like?

```json
{
  "$schema": "https://unpkg.com/laymos/schema.json",
  "sourceRoots": ["src"],
  "ignoredPaths": ["src/generated"],
  "storiesPath": "stories",
  "layers": {
    "cli": {
      "paths": ["src/cli"],
      "description": "Command surface",
      "modules": { "src/cli": {} }
    },
    "domain": {
      "paths": ["src/domain"],
      "modules": {
        "src/domain/orders": { "exposed": true },
        "src/domain/catalog": { "shared": true, "exposed": true }
      }
    },
    "services": {
      "paths": ["src/services"],
      "moduleGraphs": {
        "store": {
          "path": "src/services/store",
          "modules": {
            "index.ts": { "exposed": true },
            "engine": {},
            "model": {}
          },
          "rules": { "index.ts": ["engine"], "engine": ["model"] }
        }
      }
    }
  },
  "layerGraphs": {
    "architecture": {
      "rules": {
        "cli": ["domain"],
        "domain": ["services"],
        "services": []
      }
    }
  }
}
```

The `$schema` key gives editors autocomplete and validation. Trust it over prose.

## What do the top-level keys do?

- `sourceRoots` — the files and folders Laymos analyzes.
- `ignoredPaths` — files and folders removed from analysis.
- `storiesPath` — an optional folder containing the executable Story tree; it
  is implicitly ignored by architecture analysis.
- `layers` — each id maps to literal project-relative `paths`, plus an optional
  `description`, and owns the modules declared within it. Layers partition every
  supported file under `sourceRoots` and may not overlap.
- `layers.<id>.modules` — free-form modules, keyed by project-relative path.
  `{}` means a module nobody may import. Add `shared` and `exposed` as needed.
- `layers.<id>.moduleGraphs` — bounded sets of modules with their own rules.
  Read `graphs.md`.
- `layerGraphs` — named sets of `rules`. Each rule maps a layer id to the ids
  it may _directly_ depend on.

A module is declared exactly once, either free-form in its layer or as a member
of one module graph.

## What is a layer graph?

A named group of rules for one responsibility — core architecture, test
boundaries, and so on. It is organizational, not an enforcement boundary.

All graphs combine into one effective graph. That combined graph is default-deny,
transitive, and must be acyclic. A project with no permitted cross-layer imports
declares `"layerGraphs": {}`.

Declare direct edges only. Transitive reach follows.

A layer graph _hosts_ the layers it declares rules from and _reaches_ the layers
it names as targets. Rules point to the real target layer. Each referenced layer
has one configured host; declaration order breaks ties. The view groups all
unreferenced layers under `other-layers`.

## Where are paths resolved from?

The config file's own directory. `--config` defaults to `./laymos.config.json`.

## Does consuming the config need a dependency?

No. It is plain JSON. Any tool can read it.

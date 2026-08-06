# Laymos

Laymos enforces architectural dependency rules. It also provides focused
dependency queries for exploring and understanding a codebase.

## Architecture

Declare Layers and LayerGraphs in a plain `laymos.config.json`.

A **Layer** is a named group of literal project-relative files and folders.
Layers partition the supported files beneath `sourceRoots`: every included
file belongs to exactly one Layer, and no declared Layer scopes may overlap.
Use `ignoredPaths` to remove files or folders from analysis explicitly.

A **LayerGraph** is a named set of **rules** representing one responsibility
(e.g. core architecture or test boundaries). It is an organizational grouping,
not an enforcement boundary. A project may have no LayerGraphs when no
cross-Layer imports are allowed.

Each rule maps a layer id to the layer ids it may directly depend on. Rules
are default-deny: any dependency between two layers with no declared path
between them — direct or transitive, across every LayerGraph combined — is a
violation. Permission is transitive, so only direct edges need declaring (if
`app` may depend on `domain` and `domain` may depend on `infra`, `app` may
depend on `infra` without declaring it explicitly). The combined graph must be
acyclic. A layer with no outgoing rule is a valid, intentional leaf.

```json
{
  "$schema": "https://unpkg.com/laymos/schema.json",
  "sourceRoots": ["src"],
  "ignoredPaths": ["src/generated"],
  "layers": {
    "app": { "paths": ["src/app"], "description": "Application" },
    "domain": { "paths": ["src/domain"], "description": "Domain" },
    "infra": { "paths": ["src/infra"] }
  },
  "layerGraphs": {
    "architecture": {
      "description": "Core layering",
      "rules": {
        "app": ["domain"],
        "domain": ["infra"]
      }
    }
  }
}
```

No package dependency is required to author or consume this file — the
`$schema` key gives editors autocomplete/validation directly, and any other
tool (including a separate devtools server rendering the project's
architecture) can read it as plain JSON. See
[ADR-0003](docs/adr/0003-json-config-over-typescript.md) for why.

## CLI

```sh
laymos [--config <path>] lint
laymos [--config <path>] lint layers
laymos [--config <path>] deps <path> [--recursive]
```

`lint` checks every architectural rule; `lint layers` checks only Layer
coverage and dependencies. Violations exit with status `1`, while invalid
configuration or an analysis failure exits with status `2`.

`deps` prints a file or folder's dependencies as a colored tree. Direct
dependencies are yellow; with `--recursive`, transitive dependencies are gray.
All commands use `sourceRoots` and `ignoredPaths` from the config. Config paths
default to `./laymos.config.json`, and project-relative paths are resolved from
the config file's directory.

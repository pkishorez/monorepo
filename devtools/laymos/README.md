# Laymos

Laymos queries the direct and transitive file dependencies of a file or
folder.

## Architecture

Declare Layers and LayerGraphs in a plain `laymos.config.json`.

A **Layer** is a named, disjoint group of project-relative paths. A
**LayerGraph** is a named set of **rules** representing one responsibility
(e.g. core architecture, test boundaries) — an organizational grouping, not
an enforcement boundary. A project must declare at least one LayerGraph.

Each rule maps a layer id to the layer ids it may directly depend on. Rules
are default-deny: any dependency between two layers with no declared path
between them — direct or transitive, across every LayerGraph combined — is a
violation. Permission is transitive, so only direct edges need declaring (if
`app` may depend on `domain` and `domain` may depend on `infra`, `app` may
depend on `infra` without declaring it explicitly). A layer with no outgoing
rule is a valid, intentional leaf.

```json
{
  "$schema": "https://unpkg.com/laymos/schema.json",
  "sourceRoots": ["src"],
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
laymos deps <path> [--recursive] [--root <dir>...] [--ignore <path,path,...>]
```

Prints `<path>`'s dependencies as a colored tree — a file or folder,
project-relative. Direct dependencies (imported straight from inside the
target) are yellow; with `--recursive`, dependencies reached only by walking
further out through another dependency are also shown, in gray. The target's
own path is shown in green. `--root` sets the source root(s) to scan and is
repeatable, defaulting to `src`; `--ignore` takes a comma-separated list of
project-relative paths to exclude from the scan.

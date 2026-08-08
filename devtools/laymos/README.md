# Laymos

Laymos enforces architectural dependency rules. It also provides focused
dependency queries for exploring and understanding a codebase.

## Architecture

Declare Layers, Modules, and LayerGraphs in a plain `laymos.config.json`.

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

A **Module** is a self-contained source boundary backed by a supported source
file or directory. A **Configured Module** is an explicit, disjoint boundary
within one Layer, and every included file belongs to one. A File Module is its
own public entry point. A Directory Module without an `index.ts`, Shared status,
or nested public entry points is an **Unexposed Module**: it may depend on other
Modules but cannot be consumed by them. List an exact directory path in
`nested` to expose its `index.ts` as another public entry point into the same
Directory Module.

Configured Modules in the same Layer cannot depend on one another by default.
Marking one `shared` allows every peer to import its public entry points.
Cross-Layer dependencies use LayerGraph permission.

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
  "modules": {
    "src/app": {},
    "src/domain/orders": {},
    "src/domain/constants.ts": { "shared": true },
    "src/domain/shared": { "shared": true, "nested": ["events"] },
    "src/infra": {}
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

## Library API

```ts
import { Effect } from 'effect';
import { analyzeProject } from 'laymos';

const analysis = await Effect.runPromise(
  analyzeProject('/absolute/project/laymos.config.json'),
);
```

`analyzeProject` returns `ArchitectureAnalysis`: the decoded Config plus Layer
and Module analysis. `ArchitectureAnalysisSchema` is its runtime and transport
contract; its Maps and Sets support Effect Schema's canonical JSON codec.

Browser and RPC code should import the contract-only entrypoint:

```ts
import {
  ArchitectureAnalysisSchema,
  type ArchitectureAnalysis,
} from 'laymos/architecture-analysis-schema';
```

This entrypoint contains data schemas and types only. Project analysis remains
available from the Node-oriented root entrypoint.

## CLI

```sh
laymos [--config <path>] lint
laymos [--config <path>] lint layers
laymos [--config <path>] lint modules
laymos [--config <path>] deps <path> [--recursive]
```

`lint` checks every architectural rule; `lint layers` checks Layer coverage,
configured Module presence, and dependencies, while `lint modules` checks
Module coverage, expected entry points, dependencies, public boundaries, and
cycles. Violations exit with status `1`, while invalid configuration or an
analysis failure exits with status `2`.

`deps` prints a file or folder's dependencies as a colored tree. Direct
dependencies are yellow; with `--recursive`, transitive dependencies are gray.
All commands use `sourceRoots` and `ignoredPaths` from the config. Config paths
default to `./laymos.config.json`, and project-relative paths are resolved from
the config file's directory.

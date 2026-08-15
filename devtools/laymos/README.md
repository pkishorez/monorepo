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
within one Layer, and every included file belongs to one. Its `kind` is Normal
by default. Marking it `shared` lets peers in the same Layer import it; Layer
Rules still decide cross-Layer access. An Entry Module may depend on other
Modules but cannot be imported by one.

A Normal or Shared File Module is its own public entry point. A Normal or Shared
Directory Module requires a root `index.ts`. List an exact directory path in
`subpaths` to add another public `index.ts` for tree shaking. Entry Modules
follow their host's file convention and cannot declare Subpaths.

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
    "src/app": { "kind": "entry" },
    "src/domain/orders": {},
    "src/domain/catalog": { "kind": "shared", "subpaths": ["events"] },
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

Load the current source snapshot for one Configured Module on demand:

```ts
import { Effect } from 'effect';
import { loadModuleSource } from 'laymos';

const snapshot = await Effect.runPromise(
  loadModuleSource('/absolute/project/laymos.config.json', 'src/domain/orders'),
);
```

The snapshot contains only included supported source files assigned to that
Module by a fresh Architecture Analysis.

Inspect an exact included source file or Configured Module without consuming
the complete Architecture Analysis:

```ts
import { Effect } from 'effect';
import { inspectFile, inspectModule } from 'laymos';

const file = await Effect.runPromise(
  inspectFile('/absolute/project/laymos.config.json', 'src/domain/order.ts', {
    recursive: true,
  }),
);
const module = await Effect.runPromise(
  inspectModule('/absolute/project/laymos.config.json', 'src/domain/orders'),
);
```

## CLI

```sh
laymos [--config <path>] lint
laymos [--config <path>] lint layers
laymos [--config <path>] lint modules
laymos [--config <path>] inspect project [--json]
laymos [--config <path>] inspect layer <layer-name> [--json]
laymos [--config <path>] inspect file <file-path> [--recursive] [--json]
laymos [--config <path>] inspect module <module-path> [--json]
```

`lint` checks every architectural rule; `lint layers` checks Layer coverage,
configured Module presence, and dependencies, while `lint modules` checks
Module coverage, expected entry points, dependencies, public boundaries, and
cycles. Violations exit with status `1`, while invalid configuration or an
analysis failure exits with status `2`.

`inspect file` prints the file's Layer, Configured Module, public-boundary role,
and dependencies as a colored path tree. Direct dependencies are yellow; with
`--recursive`, transitive dependencies are gray. Only exact included supported
source files can be inspected. Included files with missing Layer or Module
membership remain inspectable and show a coverage warning.

`inspect project` summarizes the whole architecture. `inspect layer` accepts an
exact Layer name and reports its paths, allowed Layer links, Modules, Shared
count, and violations. `inspect module` accepts an exact configured Module path
and prints its configured kind, source shape, observed kind, public entry
points, and dependency tree. Add `--json` to any inspect command for stable tool
output. If the selected Module participates in a dependency cycle, inspection
stops and directs the user to `lint modules`.

The active inspection target is green in both trees. All commands use
`sourceRoots` and `ignoredPaths` from the config. Config paths default to
`./laymos.config.json`, and project-relative paths are resolved from the config
file's directory.

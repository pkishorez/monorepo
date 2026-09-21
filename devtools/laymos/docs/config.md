# laymos.config.json

The config declares a Project's Layers, their Modules and Module Graphs, its
LayerGraphs, and where its Stories live. It is plain JSON. The `$schema` key
gives editors autocomplete and validation without installing anything; see
[ADR-0003](./adr/0003-json-config-over-typescript.md). The authoring contract
is `ProjectConfigInputSchema` and the wire contract is `ProjectConfigSchema`,
both exported from `laymos/architecture-analysis-schema`.

All paths are project-relative and resolved from the config file's directory.

## Example

```json
{
  "$schema": "https://unpkg.com/laymos/schema.json",
  "sourceRoots": ["src"],
  "ignoredPaths": ["src/generated"],
  "storiesPath": "stories",
  "storyTimeout": "10 seconds",
  "layers": {
    "app": {
      "paths": ["src/app"],
      "description": "Application",
      "modules": { "src/app": {} }
    },
    "domain": {
      "paths": ["src/domain"],
      "modules": {
        "src/domain/orders": { "exposed": true },
        "src/domain/catalog": { "shared": true, "exposed": true }
      },
      "moduleGraphs": {
        "pricing": {
          "path": "src/domain/pricing",
          "modules": {
            "index.ts": { "exposed": true },
            "rules": {},
            "rounding.ts": {}
          },
          "rules": {
            "index.ts": ["rules", "rounding.ts"],
            "rules": ["rounding.ts"]
          }
        }
      }
    },
    "infra": {
      "paths": ["src/infra"],
      "modules": { "src/infra": { "exposed": true } }
    }
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

## Top-level keys

| Key            | Required | Meaning                                                                                                                           |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `$schema`      | no       | JSON Schema URL for editors.                                                                                                      |
| `sourceRoots`  | yes      | Files or folders that make up the analysis universe. At least one.                                                                |
| `ignoredPaths` | no       | Files or folders removed from analysis. Defaults to `[]`.                                                                         |
| `storiesPath`  | no       | Folder holding the Story files and the `index.ts` that default-exports the root Story Group. Implicitly ignored by analysis.      |
| `storyTimeout` | no       | How long one Story may run, as an Effect Duration string such as `"10 seconds"`. Defaults to 10 seconds. A Story may override it. |
| `layers`       | yes      | Every Layer keyed by id. At least one.                                                                                            |
| `layerGraphs`  | yes      | Every LayerGraph keyed by id. An empty object denies every cross-Layer dependency.                                                |

## Layers

Layers partition the supported files beneath `sourceRoots`. Every included
file belongs to exactly one Layer, and declared Layer paths may not overlap.

| Key            | Required | Meaning                                                                   |
| -------------- | -------- | ------------------------------------------------------------------------- |
| `paths`        | yes      | Files or folders in this Layer. At least one.                             |
| `description`  | no       | One-line summary.                                                         |
| `docsPath`     | no       | Markdown file documenting the Layer. Laymos reads it and never writes it. |
| `modules`      | no       | Free-form Configured Modules keyed by source file or directory.           |
| `moduleGraphs` | no       | Module Graphs keyed by id.                                                |

Every included file must belong to one Configured Module, either directly in
`modules` or as a member of a Module Graph. A Layer with no Modules is
reported by `lint layers`.

## LayerGraphs

A LayerGraph is a named set of rules for one responsibility. It groups rules;
it does not scope enforcement. Enforcement unions every rule across every
LayerGraph. See [ADR-0005](./adr/0005-layers-form-one-default-deny-dag.md).

| Key           | Required | Meaning                                                     |
| ------------- | -------- | ----------------------------------------------------------- |
| `description` | no       | One-line summary.                                           |
| `docsPath`    | no       | Markdown file documenting the LayerGraph.                   |
| `rules`       | yes      | Maps a Layer id to the Layer ids it may directly depend on. |

Rules are default-deny and transitive. If `app` may depend on `domain` and
`domain` on `infra`, `app` may reach `infra` without a rule. The combined
graph must be acyclic. A Layer with no outgoing rule is a leaf.

## Modules

A Configured Module is a disjoint source boundary backed by one file or one
directory ([ADR-0006](./adr/0006-modules-form-disjoint-deep-boundaries.md),
[ADR-0007](./adr/0007-modules-may-be-files-or-directories.md)). A directory
Module is entered through its root `index.ts`; a file Module is its own entry.
Importing anything else inside a Module is a boundary violation.

Visibility is two booleans, both `false` by default
([ADR-0012](./adr/0012-module-visibility-is-two-booleans.md)):

| Key       | Meaning                                                                            |
| --------- | ---------------------------------------------------------------------------------- |
| `shared`  | Peers in the same Layer may import this Module. Not allowed inside a Module Graph. |
| `exposed` | Other Layers may import this Module, subject to LayerGraph rules.                  |

A Module with neither flag can be imported by nobody. A `shared` Module that
nothing imports is reported as `unused-shared`.

## Module Graphs

A Module Graph is a bounded set of Modules inside one Layer that together form
one capability too large for a single Module
([ADR-0013](./adr/0013-module-graphs-partition-complex-layers.md)).

| Key           | Required | Meaning                                                                                               |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `path`        | yes      | Directory rooting the graph. Every member lives below it and every file below it belongs to a member. |
| `description` | no       | One-line summary.                                                                                     |
| `docsPath`    | no       | Markdown file documenting the graph.                                                                  |
| `modules`     | yes      | Members keyed relative to `path`. At least two, at least one `exposed`, none `shared`.                |
| `rules`       | no       | Maps a member key to the member keys it may directly import. Defaults to `{}`.                        |

Unlike LayerGraph rules, Module Graph rules are not transitive: only declared
edges are allowed. They are checked for cycles on their own and never unioned
with another graph's rules.

## Stories

When `storiesPath` is set, `<storiesPath>/index.ts` must default-export a Story
Group built with `Story.group` from `laymos/story`. Each `.story.ts` file
exports Stories built with `Story.make`. A Story's page is the `.md` sibling of
its file; a Story Group's page is a `.md` named after the group's title in the
folder its Stories share. `laymos lint` reports Story Groups without a page,
and `laymos stories` runs every Story. See
[ADR-0008](./adr/0008-stories-execute-user-code.md).

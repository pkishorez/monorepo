# laymos.config.json

Read this when writing or amending a config.

## What does a config look like?

```json
{
  "$schema": "https://unpkg.com/laymos/schema.json",
  "sourceRoots": ["src"],
  "ignoredPaths": ["src/generated"],
  "storiesPath": "stories",
  "fileModules": ["src/core/ids.ts"],
  "rules": {
    "src/app": ["src/domain", "src/infra"],
    "src/infra": ["src/domain/orders"],
    "*": ["src/core"]
  },
  "exceptions": [
    {
      "from": "src/domain/orders/preview",
      "to": "src/domain/orders",
      "because": "the preview renders the order it sits in; it moves out with the next screen"
    }
  ]
}
```

The `$schema` key gives editors autocomplete and validation. Trust it over prose.

## What do the keys do?

- `sourceRoots` — the files and folders Laymos analyzes. Git-ignored files
  are never part of it.
- `ignoredPaths` — files and folders removed from analysis, each with its
  subtree. The one way to keep a folder with an index file from being a
  Module.
- `storiesPath` — an optional folder holding the Story tree: it and every
  folder beneath it is a Story told by its `story.md`, with Self-contained
  Proofs (`*.proof.ts(x)`) directly inside; it is implicitly ignored by
  architecture analysis.
- `fileModules` — single files that are Modules of their own. The one kind of
  Module that is declared, because a file has no index to say so.
- `rules` — maps a source path (a Wrapper or Module, or `*` for every sibling
  of the target) to the target paths it may import. One way, not chained,
  as narrow as the need, never looping.
- `exceptions` — `{ from, to, because }` for the two imports no Rule can
  hold: a child importing an ancestor, and an import against a Rule.

Folder Modules are never listed. A folder with an index file is a Module; any
other folder is a Wrapper.

## Where do I write a Rule?

Between the two paths that need it, as narrow as the need. If only
`src/sync/store` needs `src/db/sqlite`, write `src/sync/store -> src/db/sqlite`,
not `src/sync -> src/db`. A broader Rule is for an architecture that demands
it: `src/app -> src/domain` when every part of the app may use every part of
the domain.

A Rule is inherited downward: everything inside the source gets it. The Laymo
shows which parts actually use it.

## What is rejected?

- A path that is not canonical and project-relative.
- A Rule or Exception naming a path that is no Module or Wrapper.
- `*` as a target.
- A Rule from inside a path to the path itself, in either direction.
- Rules that loop, followed together with folder nesting.
- An Exception without a `because`, declared twice, or one a Rule could hold.
- A File Module that is no analyzed source file.

## Where are paths resolved from?

The config file's own directory. `--config` defaults to `./laymos.config.json`.

## Does consuming the config need a dependency?

No. It is plain JSON. Any tool can read it.

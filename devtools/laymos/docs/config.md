# laymos.config.json

The config says where the source is, which single files are Modules, which
paths are ignored, which Rules hold, which Exceptions exist and why, and where
the Stories live. It is plain JSON. The `$schema` key gives editors
autocomplete and validation without installing anything; see
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

## Keys

| Key            | Required | Meaning                                                                                                                                                                               |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$schema`      | no       | JSON Schema URL for editors.                                                                                                                                                          |
| `sourceRoots`  | yes      | Files or folders that make up the analysis universe. At least one. Git-ignored files are never part of it.                                                                            |
| `ignoredPaths` | no       | Files or folders removed from analysis, each with its whole subtree. The one way to keep a folder with an index file from being a Module. Defaults to `[]`.                           |
| `storiesPath`  | no       | Folder holding the Story tree: it and each folder beneath it is a Story told by its `story.md`, with its Proofs (`*.proof.ts`, `*.proof.tsx`) inside. Implicitly ignored by analysis. |
| `storyTimeout` | no       | How long one process Proof may run, as an Effect Duration string such as `"10 seconds"`. Defaults to 10 seconds; browser Proofs default to 90 seconds. A Proof may override it.       |
| `fileModules`  | no       | Single source files that are Modules of their own. Defaults to `[]`.                                                                                                                  |
| `rules`        | no       | One-way permissions between paths. Defaults to `{}`, which lets no Module import another.                                                                                             |
| `exceptions`   | no       | Imports no Rule could hold, each with a Reason. Defaults to `[]`.                                                                                                                     |

## Modules and Wrappers

Laymos reads the tree from disk. Beneath the Source roots, minus the Ignored
paths:

- A folder with an index file (`index.ts`, `index.tsx`, `index.js`, …) is a
  **Module**. Its index is its **Index**: the one file of the Module anyone
  outside may import.
- A file listed under `fileModules` is a **Module** and its own Index.
- Any other folder is a **Wrapper**: a name for everything inside it. Nobody
  imports a Wrapper.
- A Module holding Modules is also their Wrapper. Those are **Nested
  Modules**.

Inside a Module, everything is free. Its own files (the files not inside a
nested Module) import each other, and the Index of any Module nested below
them at any depth, with nothing written.

A file in a plain Wrapper, with no Module above it, is a coverage finding:
give the folder an index file, list the file under `fileModules`, or ignore
it.

## Rules

Each key of `rules` is a source path, each value the target paths it may
import. Both are Wrappers or Modules at any depth. A Rule means: every Module
inside the source may import the Index of every Module inside the target.

- Rules are one way. `src/app -> src/domain` says nothing about the reverse.
- Rules do not chain. `a -> b` and `b -> c` grant nothing from `a` to `c`.
- Rules are as narrow as the need. `src/studio-rpc -> src/db/std-table/definition`
  grants one nested Module; `src/sync -> src/db` grants all of `db`.
- `*` as a source means every sibling of the target: a Shared Rule.
- Rules cannot loop. Followed together with folder nesting, no Module may
  reach itself; the config is rejected if one can.
- A Rule from inside a path to the path itself is rejected: a child never
  imports its parent by Rule, and a parent already imports its nested Modules.

## Exceptions

An Exception is one import the Rules could never hold, allowed on purpose.
Only two things are Exceptions: a child importing its parent or any ancestor,
and an import that goes against a Rule and would make a loop. Each carries
`because`, its Reason, and the config is rejected without one. An Exception a
Rule could hold is rejected too; declare it under `rules`.

## What the lint says

Every import between two different Modules is one of: a Module's own file
reaching a nested Index, covered by a Rule, covered by an Exception, or a
Violation. `laymos lint` names the two files of each Violation and says which
key could hold it. It also reports files no Module owns, and Rules and
Exceptions no import uses.

## Stories

When `storiesPath` is set, that folder and every folder beneath it is a Story.
Its `story.md` is the Telling: a `#` title, a pitch paragraph, then a body that
links each sub-Story by id where it explains how that part fits. The top
Story's id is the Project's folder name; a sub-Story's id adds its folder path.
Every `*.proof.ts` and `*.proof.tsx` file directly in a folder default-exports
one Proof built with `Proof.make` or `Proof.browser` from `laymos/story`; its
id is the Story id plus the file name without the suffix. A Proof file imports
only what the Project ships, `effect`, and `laymos/story`; `laymos lint`
reports any relative import and every Telling issue. `laymos stories` runs the
Proofs and writes Evidence to `.laymos/stories/<proof id>/`, which belongs in
`.gitignore`. See [writing-stories.md](./writing-stories.md),
[ADR-0008](./adr/0008-stories-execute-user-code.md),
[ADR-0017](./adr/0017-a-story-is-one-self-contained-claim.md), and
[ADR-0018](./adr/0018-stories-are-a-tree-of-tellings.md).

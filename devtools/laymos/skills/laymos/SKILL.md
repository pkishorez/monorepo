---
name: laymos
description: Laymos architecture rules — one tree of Modules and Wrappers, Rules and Exceptions, naming, config, and CLI. Use when planning or changing a project's architecture, when reading laymos.config.json or laymos output, or when another skill needs the Laymos model.
---

# Laymos

Reference. Read it before planning or changing a project's architecture.
It answers _what_, never _how to run a session_.

## What is Laymos trying to achieve?

Stable code at the bottom. Volatile code on top. Dependencies point down.

The bottom knows nothing about the top. So the bottom stays small, testable,
and reusable, and features churn in the top where churn is cheap.
This is stratified design, from _Grokking Simplicity_ by Eric Normand.

Laymos does not ask you to declare the strata. It reads the folder tree,
you write the few Rules that say who may import whom, and the strata are what
the picture shows: inside any folder, a Module sits below the siblings that
import it.

Read `references/design.md` before choosing module boundaries, splitting or
combining modules, or designing orchestration.

## What is Laymos?

Laymos is a CLI tool. It reads `laymos.config.json`.

It classifies every import against the Rules and Exceptions, inspects the
Module tree, and runs the Proofs in the project's Stories.

The config states intent. Source code is evidence. When the two disagree,
`laymos lint` reports the gap and says which key could close it.

## What is a Module?

A folder with an index file (`index.ts`, `index.tsx`, …), or a single file
listed under `fileModules`. Nothing else is declared: Laymos reads the tree
from disk beneath `sourceRoots`, minus `ignoredPaths`.

- Its **Index** is the one file of the Module anyone outside may import. It
  only exports; the Module's own files do the importing.
- Inside a Module, everything is free. Its **own files** (the files not inside
  a nested Module) import each other, and the Index of any Module nested
  below them, with nothing written.
- A Module holding Modules is their Wrapper too. Those are **Nested
  Modules**: islands like any other, reachable from outside only by Rule.
- A folder that should not be a Module should not have an index file, or
  should be an ignored path.

A Module's Index is a thin door over a wide interior — read the `deep-module`
skill for its shape.

## What is a Wrapper?

A folder without an index file. It is a name for everything inside it: a
Rule may point at it to mean every Module beneath it. Nobody imports a
Wrapper, and it should hold no files of its own; a file in a plain Wrapper
is a coverage finding (`laymos lint` says so).

## What is a Rule?

By default no Module imports any other. A Rule is a one-way permission
between two paths, each a Wrapper or a Module at any depth:

```json
"rules": {
  "src/app":        ["src/domain", "src/infra"],
  "src/studio-rpc": ["src/db/std-table/definition"],
  "*":              ["src/core"]
}
```

Every Module inside the source may import the Index of every Module inside
the target. Rules do not chain. Write them as narrow as the need: a Rule to a
nested Module grants that Module alone; a Rule to a Wrapper grants everything
in it. `*` as a source means every sibling of the target (a Shared Rule).
Rules cannot loop, and a Rule from inside a path to the path itself is
rejected.

A Rule says _may_, never _should_. Which Modules use it is read from the
code; the Laymo shows it.

## What is an Exception?

One import no Rule could hold, allowed on purpose with a Reason:

```json
"exceptions": [
  { "from": "src/eschema/tutorial", "to": "src/eschema",
    "because": "the tutorial uses eschema; it moves out with the docs site" }
]
```

Only two things are Exceptions: a child importing its parent or an ancestor,
and an import against a Rule that would make a loop. Anything else you want
is a Rule, and Laymos rejects an Exception a Rule could hold. Prefer moving
the code to adding an Exception; a child that imports its parent is a user of
the parent, not a part of it.

## What is a Story?

A Story is one idea about the project, told to its Reader in plain English.
Each folder beneath `storiesPath` is a Story; its `story.md` is the Telling: a
`#` title, a one-sentence pitch, then a short body that links every sub-Story
by id where it explains how that part fits. The top Story's id is the
project's folder name; a sub-Story adds its folder path (`my-app/sync`).

A Proof is one claim backing the Story it sits in: a `*.proof.ts(x)` file that
default-exports `Proof.make` or `Proof.browser` from `laymos/story`. Its id is
the Story id plus the file name (`my-app/sync/two-tabs`). It imports only what
the project ships, `effect`, and `laymos/story`; never a relative path.

Before writing a Telling or a Proof title, read
[Writing Stories](https://github.com/pkishorez/monorepo/blob/main/devtools/laymos/docs/writing-stories.md).
`laymos lint` reports a missing or incomplete Telling, a link to nothing, and
a sub-Story its parent never links.

## How do I name things?

Use the project's own words. The `domain-modeling` skill owns those words;
read it when a term is missing or contested.

- Folders are lowercase kebab-case.
- Name a Module with a concrete noun: `file-graph`, `project-config`.
- Name work that runs with verb-noun: `load-project`.
- `utils`, `helpers`, `common`, `misc`, `lib`, `impl` name nothing.
  Use the capability they hide.
- A Module's identity is its project-relative path. The short name is a label.

## Which command answers which question?

| Question                                              | Command                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| Does every import obey the Rules?                     | `laymos lint`                                   |
| What is the whole tree, and which Rules hold?         | `laymos inspect project`                        |
| What may this Module import, and who imports it?      | `laymos inspect module <path>`                  |
| Which Module owns this file, and what does it import? | `laymos inspect file <file-path> [--recursive]` |
| Do the Proofs in a Story, or one Proof, pass?         | `laymos stories [scope] [--concurrency <n>]`    |

Every command takes `--config <path>`. It defaults to `./laymos.config.json`.
Add `--json` to any `inspect` command and parse the result. Without it, read
the tree. Exit `0` is clean. Exit `1` means violations or non-passing Proofs.
Exit `2` means a broken config or an operational failure.

Use the project's package runner when `laymos` is not on `PATH`.

## What does a lint finding mean?

- **no Rule covers it** — declare a Rule, at the lowest folder that contains
  both sides, as narrow as the need.
- **a Rule would make a loop** — the direction is wrong somewhere. Re-cut, or
  declare an Exception with a Reason.
- **a child importing its parent** — move the child out, or declare an
  Exception with a Reason.
- **reaches a file that is no Index** — import the Module through its index
  file, and export what was needed from there.
- **no Module owns this file** — give its folder an index file, list it under
  `fileModules`, or ignore it.
- **declared but unused** — a Rule or Exception nothing uses. Delete it.

---
name: laymos
description: Laymos architecture rules — the layer stack, module visibility, module graphs, naming, config, and CLI. Use when planning or changing a project's architecture, when reading laymos.config.json or laymos output, or when another skill needs the Laymos model.
---

# Laymos

Reference. Read it before planning or changing a project's architecture.
It answers _what_, never _how to run a session_.

## What is Laymos trying to achieve?

Stable code at the bottom. Volatile code on top. Dependencies point down.

The bottom knows nothing about the top. So the bottom stays small, testable,
and reusable, and features churn in the top where churn is cheap.
This is stratified design, from _Grokking Simplicity_ by Eric Normand.

One common stack, bottom to top:

- **domain** — the words of the problem. Types, schemas, pure functions. No I/O.
- **clients** — the outside world, wrapped. Third-party APIs, the database, the filesystem.
- **services** — one responsibility each, built on domain and clients.
- **orchestrator** — puts services and clients together to get the real work done.
- **entry** — where the host starts. A CLI, a route, a worker.

That stack is a mental model, not a rule. Layers come from the application you
are building, and you name them for the jobs your project actually has.
The direction is the part that never changes.

Read `references/design.md` before choosing module boundaries, splitting or
combining modules, declaring a module graph, or designing orchestration.

## What is Laymos?

Laymos is a CLI tool. It reads `laymos.config.json`.

It lints declared dependency rules, inspects layers and modules, and runs the
project's executable Stories.

The config is the source of architectural truth. Source code is evidence.
When the two disagree, the config states the intent and the lint reports the gap.

## What is a layer?

A layer is a group of files with one architectural job.

A layer owns dependency rights. `a -> b` reads "a may depend on b".
Rights are transitive: if `a -> b` and `b -> c`, then `a` may depend on `c`.
Anything not permitted is a violation. The rule graph must be acyclic.

Every analyzed supported file belongs to exactly one layer. Layers may not overlap.
A layer with no outgoing rule is a valid leaf.

Create a layer when a job needs its own dependency direction.
Folders, teams, and display groups are not layers.
A one-module layer is fine when that module needs distinct rights.

## What is a module?

A module is a source boundary inside one layer. It owns one capability and the
design decisions that capability hides behind a small, stable door.

A module is a file or a directory. That is its _shape_.
A module declares two booleans, `shared` and `exposed`, both defaulting to
false. They control layer-wide and cross-layer access; module graph rules grant
access between members separately. Read `references/visibility.md` when deciding.

A directory module needs a root `index.ts` when it is shared, exposed, or a
module graph member. That index is a thin door over a wide interior — read the
`deep-module` skill for its shape. When a file module needs an entry point, its
own file is that entry point.

Two modules never overlap. Every analyzed file in a layer belongs to one module.

## What is a module graph?

A named, bounded set of modules inside one layer, rooted at a directory, whose
connections are declared as rules. It describes one capability too large for a
single module: normally one facade is exposed and the other members stay private.

Unlike a layer graph it is a disjoint unit — its rules are never unioned with
another graph's, are **not** transitive, and are checked for cycles on their own.
Module graphs do not nest. Read `references/graphs.md` before declaring one.

A layer holds free-form modules, module graphs, or both. A layer groups by
architectural role; a graph describes how modules work together.

## How do I name things?

Use the project's own words. The `domain-modeling` skill owns those words;
read it when a term is missing or contested.

- Layer ids and folders are lowercase kebab-case.
- Name a layer for its dependency job, not its folder.
- Name a module with a concrete noun: `file-graph`, `project-config`.
- Name work that runs with verb-noun: `load-project`.
- `utils`, `helpers`, `common`, `misc`, `lib`, `impl` name nothing.
  Use the capability they hide.
- A module's identity is its full configured path. The short name is a label.

Write a layer description as the job it owns. Write a module job as one sentence.

## Which command answers which question?

| Question                                                         | Command                                         |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| Does the project obey its rules?                                 | `laymos lint`                                   |
| Are layer coverage and links correct?                            | `laymos lint layers`                            |
| Are module boundaries and entry points correct?                  | `laymos lint modules`                           |
| What is the whole architecture?                                  | `laymos inspect project`                        |
| What is in this layer, and what may it reach?                    | `laymos inspect layer <layer-name>`             |
| What visibility, shape, surface, and deps does this module have? | `laymos inspect module <module-path>`           |
| Which layer and module owns this file, and what does it import?  | `laymos inspect file <file-path> [--recursive]` |
| Do the executable Stories pass?                                  | `laymos stories [--concurrency <n>]`            |

Every command takes `--config <path>`. It defaults to `./laymos.config.json`.
Add `--json` to any `inspect` command and parse the result. Without it, read the tree.
Exit `0` is clean. Exit `1` means violations, an inspection cycle, or non-passing
Stories. Exit `2` means a broken config or an operational failure.

Use the project's package runner when `laymos` is not on `PATH`.

## What do the inspect fields mean?

- `shared` and `exposed` are the configured intent.
- `graph` names the module graph a member belongs to.
- `shape` is file or directory.
- `observedKind` is the module's current position in the import graph.
- Imports show current use. They do not decide the target design.

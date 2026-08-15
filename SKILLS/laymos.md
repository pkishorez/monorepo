---
name: laymos
description: Design a project's Laymos Layers and Modules through a guided interview.
disable-model-invocation: true
---

# Laymos

Design a clear target architecture. Use Laymos facts first. Use source code only
to answer questions the Laymos CLI cannot answer. Ask the user to approve the
target before changing files.

## 1. Pick the mode

Choose one mode from the request:

- **Project**: review every Layer and Module. This is the default.
- **Layer**: review one named Layer and all its Modules.
- **Module**: review one configured Module and its files.

Resolve the exact `laymos.config.json` first. For Layer and Module mode, also
resolve the exact configured name or path. The mode is ready when the config
and target are unambiguous.

## 2. Read the project words

Read `CONTEXT-MAP.md` when it exists. Then read the nearest relevant
`CONTEXT.md` files. Treat these files as the source of project names and
meanings.

Use this view when a context map exists:

```text
Project
└── Context
    └── Layer
        └── Module
```

Context is a documentation group. It does not add a Laymos rule.

Record unclear, missing, and conflicting terms. Propose a context update when
the target design needs a new term. The language pass is ready when every Layer
and Module can be named with project words or has one clear naming question.

## 3. Ask Laymos first

Run the narrowest useful command with `--json`:

```sh
laymos --config <config> inspect project --json
laymos --config <config> inspect layer <layer-name> --json
laymos --config <config> inspect module <module-path> --json
```

Use the project command once for Project mode. Use the Layer or Module command
first for a focused mode. Use more inspect commands only when the first result
points to a specific gap.

If `laymos` is not on `PATH`, use the project's package runner. If the command
fails, report the failure and read the config directly. Do not scan the whole
source tree as a substitute for a working narrow query.

Keep declared intent separate from observed imports:

- Configured `kind` says what access the Module should allow.
- `shape` says whether the Module is a file or directory.
- `observedKind` says where imports place it now.
- Imports show current use. They do not decide the target design.

This step is ready when the current Layers, Modules, doors, links, and
violations in scope are known.

## 4. Read only the source that matters

Read each public `index.ts`, Entry host file, and configured Subpath in scope.
Read private files only when they are needed to judge the Module's job, name,
or public functions.

For Project mode, sample internals only when a name, job, kind, or boundary is
unclear. For Layer mode, read every Module door in that Layer. For Module mode,
read the full Module.

Record the exact public symbols and what each one does. This step is ready when
every public door in scope has a plain one-line job.

## 5. Grill the design

Ask all live questions in one numbered round. Put a direct recommendation under
each question. Ask about decisions; find facts yourself.

Cover these questions when they are live:

1. What one job does each Layer own, and why does that job need its own set of
   dependency rights?
2. What one capability does each Module own, and which files change with it?
3. Can every pair of Normal Modules in one Layer stay independent?
4. Does each Shared Module serve real peers in its own Layer?
5. Is each Entry Module started by a host and free of inbound Module use?
6. Does each Subpath solve a real tree-shaking need?
7. Do the proposed names use the same project words as the context docs?
8. Which current imports express the target design, and which should change?

Ask sharper follow-ups for uncertain answers. Stop when every live branch has a
decision or an explicit open question.

## 6. Apply the rules

### Layers

A Layer groups files that need the same cross-Layer dependency rights. Create a
new Layer only when its job needs a different direction in the Layer graph. A
folder, team, or display group alone is not a reason.

Read every arrow as “A may depend on B.” Permission is transitive. Show direct
rules and effective reach separately when that difference matters.

A one-Module Layer is sound when the Module needs distinct dependency rights.
Otherwise the Layer adds no useful rule.

### Modules

A Module owns one cohesive capability, one private interior, and a small public
story. Its files should change and move together.

Keep Normal Modules in the same Layer independent. If two peers need common
code, first try to keep it in the owner, merge the peers, or move a stable lower
capability to a Layer with the right dependency rule.

Use `kind: "normal"` by omission. A Normal Module can be used by permitted
Modules in other Layers. Peers in its own Layer cannot use it.

Use `kind: "shared"` only for a real Layer-wide capability. Shared adds inbound
use from peers in the same Layer. Layer rules still decide cross-Layer use.

Treat Shared as an exception:

- A Shared Module needs at least one same-Layer user. Laymos reports a violation
  when it has none.
- One same-Layer user triggers a merge, ownership, or Layer check.
- More than one Shared Module in a Layer triggers a Layer design check.
- A Shared Module that uses another Shared Module triggers a merge or lower
  Layer check.
- A Layer made only of Shared Modules is invalid.

These checks ask for a reason. They do not replace the confirmed design.

Use `kind: "entry"` for a host-started root such as a CLI, route, worker, or
framework entry. It may depend on allowed Modules. No Module may depend on it.
It follows the host's file name and has no Subpaths.

File and Directory are shapes, not access kinds. A File Module is a small deep
boundary with no private companions. Promote it to a Directory Module when it
gains an interior.

### Deep shape

Make every Module tell one short story.

For a Normal or Shared Directory Module:

1. Use root `index.ts` as a small, pure door.
2. Put the main flow in `<module-name>.ts`.
3. Give private child files role names from the domain.
4. Expose a few complete capabilities, not a bag of helper types.

For an Entry Module, let the host file replace the public barrel. Keep the main
flow in that file or in one clearly named Module file. The lack of `index.ts`
does not make the Module shallow.

Use `subpaths` only for extra tree-shaking doors. A Subpath is a small view of
the parent Module's capability. It does not own a new policy or a new life. If
it needs either, move it to a separate Module at a disjoint path.

### Names

Use the project's domain words first. Add the word to `CONTEXT.md` before using
an architectural synonym.

- Use lowercase kebab-case for Layer ids and folder names.
- In a project with several contexts, prefer `<context>.<role>` for Layer ids.
- Name a Layer for its dependency job, not its current folder.
- Name a Module with a simple noun or noun pair, such as `file-graph`.
- Use verb and noun for work that runs, such as `load-project`.
- Keep brand spelling in prose and use lowercase ids in config.
- Replace vague names such as `utils`, `helpers`, `common`, `shared`, `misc`,
  `lib`, and `impl` with the owned idea.
- Use the full configured Module path as its identity. A short name is only a
  display label.

Write each Layer description as the job and decisions it owns. Write each
Module job as one sentence. The names are ready when the same nouns appear in
context docs, folders, config, and the proposed public functions.

## 7. Propose the target

Lead with a short project story. Then show:

1. Each Layer name, job, paths, and direct “may depend on” rules.
2. Each Module under its Layer with its full path, job, kind, shape, public
   functions, root door, and Subpaths.
3. Every rename, move, kind change, rule change, and context-doc change.
4. The reason for each Shared Module, Entry Module, and Subpath.
5. Imports that must change and violations that will remain open.

For Layer mode, include the Layer's incoming and outgoing links and every
Module in it. For Module mode, include its public story, private roles, users,
dependencies, and exact source changes.

End with one explicit request to approve the target state. Do not edit the
project before that approval.

## 8. Apply an approved target

When the user asked for implementation and approved the target, update the
context docs, config, source boundaries, and tests together. Run Laymos lint
and the narrow project checks. Report any remaining difference from the
approved target.

The run is complete only when:

- Project mode accounts for every Layer and Module.
- Layer mode accounts for every Module and dependency link in that Layer.
- Module mode accounts for every file, public symbol, user, and dependency in
  that Module.
- Every Shared, Entry, and Subpath choice has a stated reason.
- Names match the project language.
- The user approved the target before edits.
- The final Laymos and project checks are reported.

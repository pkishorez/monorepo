---
name: laymos
description: Design or revise a project's Laymos Layers and Modules through a guided interview.
disable-model-invocation: true
---

# Laymos

Produce an approved target architecture before changing the project. Treat
Laymos output as the source of architectural facts and source code as evidence
for responsibilities, names, and public contracts. Ask the user only for design
decisions that the project cannot answer.

## Workflow

### 1. Set the scope

Infer one mode from the request:

- **Project**: every Layer and Configured Module. This is the default.
- **Layer**: one exact Layer and every Configured Module in it.
- **Module**: one exact Configured Module and all of its included files.

Resolve the exact `laymos.config.json` first. In Layer or Module mode, also
resolve the exact configured name or path. Continue only when the config, mode,
and target are unambiguous.

### 2. Establish the project language

Read `CONTEXT-MAP.md` when present, then the nearest `CONTEXT.md` files relevant
to the scope. These documents define the project's words and meanings.

When a context map exists, use this documentation hierarchy:

```text
Project
└── Context
    └── Layer
        └── Module
```

A Context groups documentation; it adds no Laymos dependency rule. Record each
missing, unclear, or conflicting term. When the target needs a new term, include
the corresponding context-doc change in the proposal.

This pass is complete when every Layer and Module in scope either has a precise
project term or one explicit naming decision remains for the user.

### 3. Inspect the architecture

Run the narrowest matching command with stable JSON output:

```sh
laymos --config <config> inspect project --json
laymos --config <config> inspect layer <layer-name> --json
laymos --config <config> inspect module <module-path> --json
```

Use the project's package runner when `laymos` is not on `PATH`. Run additional
inspection commands only for a specific gap revealed by the first result. If
inspection still fails, report the error and use the config plus targeted source
reading; a broad source-tree scan is not a replacement for architectural facts.

Keep intent and observation separate:

- Configured `kind` is the intended Module access policy.
- `shape` is File or Directory.
- `observedKind` describes the Module's current position in the import graph.
- Imports show current use; they do not determine the target architecture.

This pass is complete when every in-scope Layer, Configured Module, public entry
point, dependency, and violation is accounted for.

### 4. Read the decisive source

Read every public `index.ts`, Entry host file, and configured Subpath in scope.
Read private files only as needed to judge a Module's responsibility, name, or
public contract.

- In Project mode, sample interiors only where the job, name, kind, or boundary
  remains unclear.
- In Layer mode, read every Module entry point in the Layer.
- In Module mode, read every included file in the Module.

Record every public symbol and its one-line job. This pass is complete when each
public entry point tells a coherent story and every unresolved judgment is
identified.

### 5. Interview the user

Form a recommended design before asking questions. Ask one numbered round that
contains every currently live decision, with a direct recommendation and its
reason under each question. Investigate facts yourself.

Probe only the branches that remain live:

1. What single job gives each Layer its dependency rights?
2. What cohesive capability and change-set does each Module own?
3. Can Normal Modules in the same Layer remain independent?
4. Does each Shared Module serve genuine same-Layer peers?
5. Is each Entry Module host-started and free of inbound Module dependencies?
6. Does each Subpath serve a demonstrated tree-shaking need?
7. Do names use the same words as the context docs?
8. Which observed imports match the target, and which must change?

After each answer, investigate any new factual question and ask another round
only for decisions still unresolved. The interview is complete when every live
branch has a decision or is explicitly recorded as open.

### 6. Propose the target

Apply the design rules below. Lead with a short project story, then show:

1. Each Layer's name, job, paths, and direct “may depend on” rules.
2. Each Configured Module's full path, job, kind, shape, public contract, root
   entry point, and Subpaths.
3. Every rename, move, kind change, rule change, and context-doc change.
4. The reason for every Shared Module, Entry Module, and Subpath.
5. Imports that must change and violations intentionally left open.

In Layer mode, include every Module plus the Layer's incoming and outgoing
links. In Module mode, include every file, public symbol, user, dependency, and
exact proposed source change.

End by asking for explicit approval of this exact target. Do not edit project
files before approval. Prior approval counts only when it names the same target
without unresolved choices.

### 7. Implement an approved target

Run this step only when the user requested implementation and approved the
exact target. Update context docs, config, source boundaries, imports, and tests
as one change. Run `laymos --config <config> lint` and the narrow project checks.
Report every remaining difference from the approved target.

## Design rules

### Layers

A Layer is a dependency-policy cohort: source with one architectural job and
therefore one set of cross-Layer dependency rights. Create a Layer only when
that job needs a distinct direction in the Layer graph; folders, teams, and
display groups do not create policy.

Read `A -> B` as “A may depend on B.” Permission is transitive. Show direct
rules separately from effective reach whenever their difference affects a
decision.

A one-Module Layer is useful when that Module needs distinct dependency rights.
Otherwise it adds no architectural rule.

### Modules

A Module owns one cohesive capability, a private interior, and a small public
contract. Its files should change and move together.

Normal Modules in one Layer are independent. When peers appear to need common
code, first test whether one peer owns it, the peers should merge, or a stable
lower capability belongs in a Layer with the right dependency policy.

Use Normal by omission. A Normal Module is available to permitted consumers in
other Layers, while same-Layer peers cannot depend on it.

Use Shared only for a genuine Layer-wide capability. Shared permits inbound use
from peers in the same Layer; Layer rules still govern cross-Layer use. Apply
these pressure tests:

- No same-Layer user is an `unused-shared` violation.
- One same-Layer user demands a merge, ownership, or Layer check.
- Multiple Shared Modules in one Layer demand a Layer-design check.
- A Shared Module depending on another Shared Module demands a merge or
  lower-Layer check.
- A Layer containing only Shared Modules is invalid.

These tests demand an explicit reason; they do not decide the design by
themselves.

Use Entry for a host-started root such as a CLI, route, worker, or framework
entry. It may depend on permitted Modules, no Module may depend on it, it follows
the host's filename convention, and it has no Subpaths.

File and Directory are shapes, not access kinds. A File Module is a small
boundary with no private companions. Promote it to a Directory Module when it
gains an interior.

### Public shape

Make each Module tell one short story.

For a Normal or Shared Directory Module:

1. Use root `index.ts` as a small, pure entry point.
2. Put the main flow in `<module-name>.ts`.
3. Give private files role names from the domain.
4. Expose a few complete capabilities instead of a bag of helpers and types.

For an Entry Module, let the host file replace the public barrel. Keep its main
flow in that file or one clearly named private file. The absence of `index.ts`
does not make an Entry Module shallow.

Use Subpaths only as extra tree-shaking entry points. A Subpath is a small view
of its parent Module's capability. When it owns a separate policy or lifecycle,
make it a disjoint Configured Module instead.

### Names

Use the project's domain words. Propose the context-doc definition before
introducing an architectural synonym.

- Use lowercase kebab-case for Layer ids and folder names.
- In a multi-context project, prefer `<context>.<role>` for Layer ids.
- Name a Layer for its dependency job, not its current folder.
- Name a Module with a concrete noun or noun pair, such as `file-graph`.
- Use verb-noun for work that runs, such as `load-project`.
- Preserve brand spelling in prose and use lowercase ids in config.
- Replace `utils`, `helpers`, `common`, `shared`, `misc`, `lib`, and `impl` with
  the capability they hide.
- Use the full configured Module path as its identity; a short name is only a
  display label.

Write each Layer description as the job and decisions it owns. Write each
Module job as one sentence. Naming is complete when context docs, paths, config,
and public symbols use the same nouns.

## Completion

A design-only run is complete when the proposal exhaustively accounts for its
mode, records every exception and open decision, and has been presented for
explicit approval.

An implementation run is complete only when the approved target is reflected
in context docs, config, source, and tests; Laymos lint and the relevant project
checks have run; and every remaining mismatch is reported.

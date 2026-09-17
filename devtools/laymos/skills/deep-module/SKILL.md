---
name: deep-module
description: Deep modules — folders with a narrow index.ts door over a wide interior orchestrated by a mandatory <name>.ts. Use when the user asks to deep-modularize, encapsulate, or tighten the public surface of a folder, runs /deep-module, or another skill needs the deep-module shape.
---

# deep-module

A **deep module** is a folder with a narrow door and a wide interior: very little exported, lots of well-organised implementation inside. It has a name and a specific responsibility (or a few related ones) that read like a story, and everything it exposes is _deep_ — real capability, never a shallow pass-through.

## The shape

For a module named `hello`:

```
hello/
├── index.ts      # the door: pure barrel, re-exports from hello.ts only
├── hello.ts      # the orchestrator: everything public is implemented here
├── <role>.ts     # helpers, one clear reason to exist each, named by role
└── <child>/      # nested deep module, private to this module
    ├── index.ts
    └── child.ts
```

## Hard laws

1. **`index.ts` is a pure barrel.** Re-exports only — it is the one file outsiders import from. Any logic it wants belongs in `hello.ts`.

2. **`<name>.ts` is mandatory** in every deep module, nested ones included. It is the single implementation point for the public surface: every exposed function is implemented here; an exposed service (e.g. an Effect service and its layer) lives here. A deep function orchestrates the helper files to produce its result; the other files hold only helpers. `index.ts` re-exports exclusively from `<name>.ts`.

3. **Export functionality, not types.** Default is zero exported types. A type earns export only when an external caller provably cannot be written without naming it (e.g. it annotates a value the caller constructs and hands back). A type that only appears as a parameter or inferred return stays inside. When unsure, leave it out and add it back when a real caller breaks.

4. **Nested deep modules are private to their parent.** Their functionality is used only within the parent's limits. The test: if `<name>.ts` would re-export a child's function verbatim, with no orchestration on top, that module is not a child — **promote it to a sibling** deep module. A deep module is self-contained; children exist only to serve it.

## Interior guidelines

Heuristics in service of one goal — **human understandability**: a reader should juggle only two or three concepts at one level. When guidelines conflict, the version that is easier to hold in your head wins.

- **`<name>.ts` reads like a story.** Top-to-bottom orchestration of named interior pieces; the heavy lifting is delegated. Reading it alone tells you what the module does.
- **Each file has a specific reason to exist.** Name by role — `header.tsx`, `state.ts`, `parser.ts`. A junk-drawer name (`utils.ts`, `helpers.ts`) means a concern hasn't been identified yet; find the concern and name it.
- **Group into nested modules.** When several files serve one distinct internal responsibility, move them into a nested deep module (same shape, recursively). Ideally one level of nesting is enough; the two-or-three focus budget applies to both breadth and depth — a wide god-module rebuilt as a deep tower just moves the violation.
- **Generic-first composition.** Behind app-specific logic there is usually a generic capability hiding (a tree, a picker, a state machine). Extract the generic core with an app-agnostic interface, compose the specific on top. Understandability comes from "specialize a generic", not from splitting for its own sake.
- **No hidden magic.** Behavior is fully predictable from the interface. Internal state, I/O, and effects are fine when passed in or localized in an obviously-named interior file. Significant state or config — anything a caller might need to read, control, or substitute — belongs at the door; trivial local detail stays inside.
- **Errors and edge cases live in the type.** If a module can fail or return empty, the interface says so — a typed result, an explicit shape, a declared throw.
- **Minimal ≠ trivial.** A single large export can be the entire surface; "minimal" counts doors, not capability. Size is fine — tangled responsibility is the enemy. One reason to change per unit.
- **The barrel is the spec.** `index.ts` tells an outsider everything they can do with the module, in one glance.

## Applying it to a folder

The module tells its own story — its responsibility decides what it exposes, never its consumers. External callers are not this skill's concern.

1. **Design** — draft the tree: `<name>.ts` orchestrator, role-named helpers, nested modules for grouped concerns, siblings for anything that must leave. Done when every export and every exported type has survived a why-challenge.
2. **Summarize for the user** — present the proposed tree, the reason each file exists, and how the structure communicates the module's story. The user adds detail; rework the design until they say okay.
3. **Implement** — only after the user's okay, reshape the files and write `index.ts`. Done when the folder matches the approved tree.

Composes with other skills: e.g. `/grill-me` + `/deep-module` to interview the user about the design before reshaping.

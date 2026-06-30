---
name: enforce-boundaries
description: >
  Run depcruise-viz lint to enforce a depcruise.config.ts, wire it into CI and a
  lint:depcruise package script, and interpret its output — layer violations vs
  visibility breaches vs coverage warnings, exit codes, overlapping-layer
  conflicts, and layer-ordering cycles. Load when adding depcruise-viz to CI,
  reading lint output, driving uncovered files to zero, or diagnosing
  "Layer ordering cycle detected".
metadata:
  type: lifecycle
  library: depcruise-viz
  library_version: '0.0.1'
sources:
  - 'pkishorez/monorepo:packages/depcruise-viz/src/cli/run.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/compile/validate-layer-ordering.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/types.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/README.md'
---

# depcruise-viz — Enforcing boundaries in CI

`depcruise-viz lint` reads `depcruise.config.ts` from the current directory,
prints layer/module coverage to stdout, and writes any violations and breaches
to stderr. It exits non-zero only when violations or breaches are found, so it
drops into CI directly.

## Setup

Add a script and run it in CI:

```json
{
  "scripts": {
    "lint:depcruise": "depcruise-viz lint"
  }
}
```

```bash
npx depcruise-viz lint
```

The config must live at the package root being cruised; `lint` resolves
`rootDir` and `tsconfig.json` relative to that directory, not the process cwd.

## Core Patterns

### Read the three output classes

- **Violations** (stderr, red) — layer-ordering breaks: a lower layer imports an
  upper one. Fix by reversing the import direction.
- **Breaches** (stderr, red) — visibility crossings into another feature's/group's
  private (or not-shared-with) internals. Fix by importing the public/shared
  surface instead.
- **Coverage warnings** (stdout, yellow) — files outside every layer or module,
  and overlapping layer patterns. These never fail the lint.

### Drive uncovered files to zero

A green lint can still report uncovered files. Treat every
`N file(s) not covered by any layer/module` warning as a to-do and add
layers/modules until coverage reports zero.

```text
Layers: 3 layer(s) cover 24/24 file(s).
Modules: 3 module(s) cover 24/24 layer-covered file(s).
No violations or boundary breaches found.
```

### Keep a shared layer's ordering consistent

A layer name reused across stacks with opposite ordering forms a cycle, and
validation throws before cruising. Keep one consistent direction for any shared
name.

## Common Mistakes

### HIGH Treating uncovered files as harmless

Wrong:

```bash
# lint exits 0 with "12 file(s) not covered by any module" -> assumed fine
```

Correct:

```bash
# add layers/modules until "0 file(s) not covered"; warnings are a to-do list
```

Coverage gaps print as yellow warnings and never set a non-zero exit, so a green
lint can hide unmodeled files.

Source: src/cli/run.ts:24-86; README Gotchas; maintainer interview

### MEDIUM Overlapping layer path patterns

Wrong:

```typescript
layer('core', ['src']); // matches everything, including src/cli
layer('cli', ['src/cli']);
```

Correct:

```typescript
layer('core', ['src/authoring', 'src/compile']);
layer('cli', ['src/cli']);
```

When two layers' paths overlap, a file matches both and is silently attributed
to the first-declared layer; this is reported only as a warning.

Source: src/cli/run.ts:70-83; src/types.ts:153

### MEDIUM Layer-ordering cycle across stacks

Wrong:

```typescript
layersTopDown('a', [x, y]); // x -> y
layersTopDown('b', [y, x]); // y -> x  => cycle x -> y -> x
```

Correct:

```typescript
// keep a single consistent ordering wherever a layer name is shared
```

Edges from every stack are merged; an inconsistent shared ordering throws
`Layer ordering cycle detected` before any cruising happens.

Source: src/compile/validate-layer-ordering.ts:52-57

### MEDIUM Confusing violations with breaches

Wrong:

```typescript
// "fix" a visibility breach by reordering layers (wrong lever)
```

Correct:

```typescript
// violation -> fix import direction; breach -> import the public/shared surface
```

Violations are layer-ordering breaks; breaches are visibility crossings — they
have different fixes.

Source: src/cli/run.ts:106-130; src/types.ts:92-129

### HIGH Generating against the wrong version surface

Wrong:

```bash
# assume a command/flag/output shape from another depcruise-viz version
```

Correct:

```bash
# check the installed depcruise-viz package.json (version) before relying on output
```

There are no maintained doc files — `package.json` is the source of truth,
refreshed each release.

Source: maintainer interview; package.json

### HIGH Tension: Zero-uncovered goal vs incremental adoption

Targeting zero uncovered files conflicts with dropping the tool into a large
existing codebase gradually. Agents either declare lint "passing" while files
stay unmodeled, or try to model everything at once and stall. Model the highest-
value boundaries first, then close coverage incrementally.

See also: author-architecture-config/SKILL.md § Common Mistakes

See also: author-architecture-config/SKILL.md — every violation/breach maps back to a layer-ordering or visibility decision in the config.

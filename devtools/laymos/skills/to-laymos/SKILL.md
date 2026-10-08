---
name: to-laymos
description: Turn a requirement into a high-level Laymos architecture proposal.
disable-model-invocation: true
---

# to-laymos

Describe how the requirement should fit the project's architecture. Stop after
the proposal; implementation is a separate task.

Read the `/laymos` skill and
[`../laymos/references/design.md`](../laymos/references/design.md) completely. Inspect
`laymos.config.json` and the doors of the modules the requirement changes or
depends on. Read the applicable `CONTEXT.md`; use `CONTEXT-MAP.md` to find it
when the project has multiple contexts. Ask only when two answers would produce
different boundaries.

For each part of the requirement, decide whether to extend a module, add a
module, or open a module into nested modules. Prefer the smallest change whose
boundaries follow the module, nesting, and orchestration guidance in
`design.md`.

Describe only the modules the requirement adds or changes, and the Rules they
need. For each one, explain what it is, what useful behavior it exposes, and
how it helps the requirement. Mention the Wrapper it sits in only when that
helps explain its place in the architecture.

Write the proposal in ASD-STE100 Simplified Technical English. Treat the
`CONTEXT.md` Language entries as the approved project vocabulary. If no context
file applies, use the terms already established in the project.

## Proposal

```markdown
## The change

<What becomes possible and the high-level architectural approach.>

## Modules

### `<full module path>`

<In one short, conversational paragraph, explain what this module is, what it
lets callers do, and how it helps complete the requirement. Describe a module
with nested modules as one capability. Name its nested modules only when they
make that capability easier to understand.>

## How the modules connect

<Explain the dependency direction and the end-to-end flow in simple terms.
Mention an unchanged module only when the flow cannot be understood without it.>

## Open questions

<Only unresolved choices that would change the architecture. Omit when empty.>
```

Keep it high-level and conversational. Explain the module promises and the
connections between them. Do not list files, implementation steps, tests, call
signatures, status labels, or unrelated architecture.

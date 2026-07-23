---
status: accepted
---

# Make Story authoring ejection-first

Laymos accepts only Story authoring forms whose ejected application code is
already present in the source. Flows directly wrap named functions; Step,
Terminal, and Omission operations are concise Effect-returning thunks that
eject to their body; Decisions mirror Effect Match through local substitutions;
and concurrency operators mirror their Effect counterparts. One shared
validator enforces this contract during linting, Story preflight, and ejection,
with runtime checks for indirect violations.

This deliberately trades flexible overloads and terse instrumentation for a
predictable escape hatch. Story wrappers may be noisy, but ejection never
invents control flow, runtime type checks, IIFEs, or suspension boundaries. The
legacy DSL is removed atomically rather than supported through a compatibility
period.

## Consequences

- Story traversal narration classifies non-empty ejected lines within each
  Story's reached application function bodies as narrated, omitted, or
  unnarrated, then reports line counts and percentages.
- Uninstrumented called helpers remain outside the Traversal scope, and
  narration percentages remain diagnostic rather than a quality gate.
- Opaque operations cannot contain Story activity, Omissions require reasons,
  and Terminals require success or a named error completion.
- Decisions accept JSON-stable literal patterns and zero-argument Arm handlers.
- Ejection is formatter-independent and internally verifies parsing, complete
  Story removal, and idempotence before its transactional write phase.

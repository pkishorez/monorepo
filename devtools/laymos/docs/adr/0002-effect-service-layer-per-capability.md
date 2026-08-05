# Each laymos capability is an Effect Context.Service + Layer, in its own deep module

Laymos capabilities (starting with dependency extraction) are wired as an
Effect `Context.Service` (e.g. `DependencyExtractor`) backed by a `Layer`
(e.g. `DependencyExtractorLive`), rather than plain exported functions.
Callers `yield*` the service instead of importing an implementation directly.
Each capability lives in its own deep module under `src/services/<name>/`
with a narrow `index.ts` door exposing only the Tag, its Layer, and any
tagged errors — never the underlying data types, which stay internal until a
real external caller needs to name them.

This is a deliberate deviation from just exporting functions: it keeps every
capability substitutable (a test double `Layer` can replace
`DependencyExtractorLive` without touching call sites) and gives future
capabilities (layer/module rule evaluation, etc.) a consistent shape to
compose against via `Effect.provide`.

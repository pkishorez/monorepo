# Use ast-grep for Story ejection

Story ejection uses `@ast-grep/napi` for syntax-only, per-file analysis and
rewriting. Simple Story Blocks use declarative mappings, while Decision chains
and import cleanup use a small programmatic tree walk. This avoids shipping the
TypeScript compiler, avoids GritQL's external CLI boundary, and keeps the
transformer source-preserving without relying on ast-grep's experimental nested
rewriters.

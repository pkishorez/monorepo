# Use ast-grep for Story ejection

Story ejection uses `@ast-grep/napi` for syntax-only, per-file analysis and
rewriting. Story constructs use constrained unwrapping or local substitutions
to native Effect and Match constructs, while validation, provenance, and import
cleanup use a small programmatic tree walk. This avoids shipping the TypeScript
compiler, avoids GritQL's external CLI boundary, and keeps the transformer
source-preserving without relying on ast-grep's experimental nested rewriters.

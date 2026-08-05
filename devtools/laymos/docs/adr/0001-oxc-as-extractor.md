# oxc-parser and oxc-resolver as the dependency extractor

Laymos extracts the raw file-dependency graph with `oxc-parser` (static
import/export specifiers) and `oxc-resolver` (specifier → file path, with
`tsconfig: 'auto'` for path-alias support), rather than a higher-level
dependency-graph library like `skott` or `dependency-cruiser`. Both oxc tools
are Rust-based, fast, and give laymos direct control over file inventory
(driven by configured Source roots, not the library's own walking) and over
what counts as an in-graph edge (internal files only — builtins and
`node_modules` are dropped during resolution). The tradeoff is that laymos
owns more of the walking/filtering logic itself instead of getting it for
free from a graph library.

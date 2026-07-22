# skott as extractor, file-level evidence

laymos succeeds depcruise-viz but does not use dependency-cruiser: the import
graph is extracted with [skott](https://github.com/antoine-coulon/skott), with
type-only dependency tracking always on, and all rule semantics stay in
laymos's own engine. A head-to-head POC (`poc/compare-extractors.ts`) showed
identical edge sets on two real packages (36/36 and 584/584 edges) with skott
~30% faster and a much simpler graph API.

The configured `sourceRoots`, not Git, define the file inventory. Laymos walks
those files and directories directly, then runs skott within each root. Imports
that leave the configured roots are outside the architecture graph.

Consequence, decided in the same breath: violations carry **file-level
evidence only** — no line numbers, no per-edge import kind. Neither extractor
reports line numbers, so `file:line` evidence would require a bespoke
enrichment pass; we dropped it instead. `import type` edges are still
enforced (they exist in the graph); they are just not labeled on the
violation. Both fields are additive later if the need returns.

Considered: keeping dependency-cruiser (richer per-edge metadata — per-import
statement entries, `preCompilationOnly` — but slower, heavier, and its
metadata advantage is moot once evidence is file-level). Known skott warts,
accepted: node ids are relative to the process cwd, not its `cwd` option
(normalize or chdir); `export type { } from` is treated as a runtime edge.

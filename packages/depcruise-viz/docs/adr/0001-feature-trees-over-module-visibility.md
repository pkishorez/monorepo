---
status: accepted
---

# Feature membership lives in declared feature trees, not in module visibility

## Context

The first feature model attached a `feature` owner and a `visibility`
(`private | shared | public`, plus `sharedWith`) to each **module**, and then
_inferred_ each feature's graph as `owned ∪ consumed` modules, scoped over the
real import graph. In practice this produced an unreadable visualization: a
feature rendered as a pile of disconnected root nodes (every owned/consumed
module whose connecting edge fell outside the scoped set), with no single entry
and no legible top-down flow.

## Decision

Feature membership moves off the module and onto an explicitly declared
**feature tree**. A **module** now carries only `(name, layer, path)` and an
optional intrinsic `barrel` flag — no owner, no visibility. A **feature** is a
declared rooted DAG: an explicit `root` plus a member list of module names, one
per user-facing entry point (so it is single-rooted by construction). Edges are
**derived** from the real import graph restricted to the member set, so the
member set alone disambiguates which fan-out edge of a shared node belongs to
which feature. The visualization reuses the existing layer-swimlane layout,
isolating the selected feature's rooted cone.

Enforcement shifts from module visibility to a **closure** lint over the trees:
a non-barrel module referenced by exactly one feature must have all its real
out-edges as members (it cannot reach outside its feature); a module referenced
by ≥2 features is a shared seam where closure relaxes to per-feature edges;
every real edge must be claimed by some feature (global coverage), except edges
leaving a barrel. Accidental coupling is caught because reaching a module you
never declared surfaces as an unclaimed edge — replacing the old breach/
`sharedWith` machinery entirely.

## Considered Options

- **Keep module-level visibility, fix only the renderer.** Rejected: the
  disconnected-roots mess is an _input_ problem (inferred membership), not a
  layout one; the layout engine already lays out a clean rooted DAG.
- **A literal tree the imports must flatten into** (each module one parent).
  Rejected: real import graphs are DAGs with shared descendants; this makes the
  common shared orchestrator illegal and produces pictures that lie.
- **Per-feature strict closure** (each feature's member set must be
  import-closed). Rejected: it makes shared modules impossible, forcing another
  feature's leaves into every feature that touches a shared node.

## Consequences

- Every existing `depcruise.config.ts` breaks: `visibility`/`sharedWith` are
  removed and feature membership must be re-authored as trees. The
  `author-architecture-config` and `enforce-boundaries` skills need rewriting.
- Barrels are exempt from closure/coverage, so their genuinely-dead re-exports
  are not flagged — an accepted blind spot in exchange for modeling
  endpoint-hosting controllers as shared single roots.
- A project with N endpoints has N features; each declaration is small
  (`root` + member names), but there are more of them.

# Modules form disjoint deep boundaries within Layers

ADR-0007 supersedes this decision only where it rejects or defers File Modules.
Its remaining directory-boundary decisions still apply.

ADR-0010 supersedes the inferred Unexposed, `shared`, and `nested` configuration
rules. Its remaining membership and dependency-boundary decisions still apply.

ADR-0013 adds Module Graphs. Configured Module roots stay disjoint and
un-nested: a Module Graph is a bounded set of Modules, never a Module itself.

Laymos requires a non-empty, path-keyed set of Configured Modules without
changing Layer or LayerGraph declarations. A Module is any directory that
follows the deep-module convention and can contain Modules recursively. A
Configured Module is one canonical project-relative Module directory contained
by exactly one Layer scope. Configured Module roots are disjoint and cannot be
nested, and every included supported file must belong to one Configured Module.

Files within one Configured Module may depend on one another freely. A
dependency from another Configured Module may target only an existing root
`index.ts` or a nested public entry point explicitly listed in `nested`.
A Configured Module with no root `index.ts`, no nested public entry points, and no
Shared status is an Unexposed Module: it may depend outward but intentionally
cannot be consumed. Shared status or a nested public entry point declares
exposure intent, so either requires the root entry point and its absence is a
Missing Module Entry Point. Root, Terminal, Regular, and Isolated describe a
Module's observed position in the Module dependency graph; Shared status
is independent of that topology.

Nested public entry points that outsiders do not need are not declared. Each
provides a separate minimal public entry point, primarily for tree shaking; it
does not create separate membership or dependency policy. Nested directories
are convention-only and are not validated. "Outside" means a
different Configured Module; directory depth inside one Configured Module does
not create an external dependency.

The `nested` field is a flat list of exact public entry-point paths, not a
hierarchy of Configured Module declarations. A deep path may be exposed without
exposing any intermediate Module. Each exposed entry point has an independent
minimal API; the Configured Module's root entry point does not have to re-export
it. Exposure changes only the eligible import target. Layer rules and Shared
Module status continue to determine whether the dependency is permitted.

Cross-Layer permission continues to come exclusively from transitive
LayerGraph reachability. Within one Layer, cross-Module dependencies are
default-deny: a Module marked `shared` grants inbound access to every peer but
receives no additional outbound permission. Exposing a nested entry point
changes only the eligible public target and grants no dependency permission.
Shared status is reserved for a genuine Layer-wide capability, not a component
used only to decompose another Module. Import count does not prove intent, so
Laymos does not lint this guidance.
The effective graph of otherwise valid cross-Module dependencies must be
acyclic.

Module lint reports coverage, missing expected entry points, forbidden
same-Layer dependencies, internal-boundary imports, and cycles through one
renderer-neutral violation list. For a single import, Layer permission takes
precedence over Module permission, which takes precedence over public-boundary
enforcement; cycles use only imports that pass those checks. Files missing
Module membership continue to receive Layer enforcement but suppress Module
checks involving them. Framework-constrained standalone files are excluded
with `ignoredPaths` for now; attached paths, physically nested Configured Module
roots, and a new convention-file abstraction were rejected or deferred to keep
the initial model small and explicit.

Architecture analysis remains renderer-neutral. CLI reports and future
visualizations transform the same analysis instead of shaping orchestration
around one consumer.

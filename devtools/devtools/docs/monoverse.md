# CONTEXT — monoverse

Glossary for Monoverse: the bird's-eye view of one pnpm monorepo, its Packages
and the dependencies between them, for discovery rather than enforcement.
Definitions only; no implementation detail.

## Language

**Monoverse**:
The DevTools Tool and domain for understanding one Monorepo as a whole: which
Packages it holds, how they depend on each other, and which of them changed.
It observes and never enforces; the only finding it reports is a Package cycle.
_Avoid_: Monorepo Tool, Workspace view, Laymos for the monorepo

**Monorepo**:
One pnpm workspace root, identified by its `pnpm-workspace.yaml`. It is the
unit a user adds to Monoverse and the universe every Package belongs to. A root
without that file is not a Monorepo; nested and non-pnpm monorepos are not
Monorepos.
_Avoid_: Workspace, repo, root project

**Package**:
One node of a Monorepo: a folder matched by the Monorepo's workspace globs that
holds a `package.json`. Apps, libraries, toolkits, and devtools are all
Packages; nothing distinguishes them but their Package group and their place in
the Package graph. The Monorepo root's own manifest is not a Package.
_Avoid_: Workspace, member, app, project

**Package dependency**:
One Package naming another Package of the same Monorepo in its manifest,
matched by name alone. How the version is written — `workspace:`, a catalog,
a plain range — has no bearing; sharing a name with a Package is what makes a
dependency internal.
_Avoid_: workspace dependency, internal link

**Package graph**:
Every Package of a Monorepo and every Package dependency between them, across
all Dependency kinds. The single source every Monoverse view is drawn from.

**Package rank stack**:
The vertical arrangement of the Package graph: a Package sits below every
Package that depends on it, so the top rank holds the Packages nothing depends
on. Ranks are derived from the Package dependencies currently shown, so hiding a
Dependency kind reshapes the stack.

**Package focus**:
The selection of one Package: its direct dependencies and dependents are
emphasized and everything else is de-emphasized yet stays interactive. Hover
previews a focus; click makes it durable. Transitive reach is not emphasized.

**Changed Package**:
A Package with at least one added or modified tracked file beneath its folder
in the Monorepo's Change set, measured against one Base ref with the same
meaning as in Laymos. Files outside every Package belong to none and are not
shown.

**Affected Package**:
A Package that is not itself changed but depends, directly or transitively, on
a Changed Package. Drawn as a lighter variant of the changed marker.

**Package group**:
The Monorepo folder a Package sits in, named by the workspace glob that matched
it (apps, toolkits, devtools, packages). A filing convention, not architecture:
it decorates a Package and never positions it.
_Avoid_: Layer, lane, kind

**Dependency kind**:
Which manifest field declares one Package's dependency on another: runtime
(`dependencies`), development (`devDependencies`), peer
(`peerDependencies`), or optional (`optionalDependencies`). The Package graph
is the union of all four; a Dependency kind is what a user filters on, never
what defines membership.

**Package cycle violation**:
Two or more Packages that depend on each other in a loop, across any Dependency
kinds. The one finding Monoverse reports, marked like a Laymos violation, and
reported regardless of which Dependency kinds are currently shown.

**Laymos badge**:
The marker on a Package that carries a `laymos.config.json` and can therefore
be opened in Laymos. Presence only: it says nothing about whether that
Project's architecture is healthy.

**Embedded Laymos**:
The full Laymos view of one Package's Project, opened over the Monoverse
canvas without leaving it, with the Project fixed and a crumb back to the
Monorepo in place of the project picker. Closing it returns to the canvas
exactly as it was left. It never adds the Project to the Laymos Tool's own
list.

**Package tree**:
The side list of a Monorepo's Packages grouped under their Package groups,
mirroring the Laymos architecture tree. Selecting there and selecting on the
canvas are one selection.

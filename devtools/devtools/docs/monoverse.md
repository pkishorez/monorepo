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

**Monoverse layout**:
How the Package graph is arranged on the canvas, one of two, switched without
leaving the view. **Folders** (the default) draws each Package group as a box
holding its Packages, ranked inside it by the Package dependencies between
them. **Ranks** drops the boxes and ranks every Package in one Package rank
stack. A layout changes drawing only, never which Packages or dependencies
exist.
_Avoid_: levels, mode, view

**Package rank stack**:
The vertical arrangement of Packages that share one box (a Package group in
the Folders layout, the whole Monorepo in Ranks): a Package sits below every
Package beside it that depends on it. Ranks are derived from the Package
dependencies currently shown, so hiding a Dependency kind reshapes the stack.

**Package focus**:
The selection of one Package or Package group: what it depends on and what
depends on it are emphasized and everything else is de-emphasized yet stays
interactive. Hover previews a focus; click makes it durable. Transitive reach
is not emphasized. At rest a line joins two Packages in one box, or two
boxes; a dependency between Packages in different boxes is drawn Package to
Package only while one of them is focused.

**Changed Package**:
A Package with at least one added, modified or deleted tracked file beneath
its folder in the Monorepo's Change set, measured against one Base ref with the same
meaning as in Laymos. Files outside every Package belong to none and are not
shown. One Base ref applies to the whole Monoverse view, and Embedded Laymos
opens measured against it.

**Package change status**:
A Package's derived standing in the Change set, by the same rule as a Laymos
Module change status: added when every file beneath it is added, modified when
any file beneath it is added, modified or deleted, deleted when it is a
Deleted Package, and otherwise unchanged.
_Avoid_: new package (for a Package that merely has a new manifest)

**Deleted Package**:
A Package the Change set took away: its `package.json` is deleted and its
folder is no Package any more. Shown faded where it stood, in its Package
group, with no dependencies, because the manifest that named them is gone;
its deleted files can still be read as diffs.
_Avoid_: removed package, missing package

**Affected Package**:
A Package that is not itself changed but depends, directly or transitively, on
a Changed Package. Drawn as a lighter variant of the changed marker.

**Package group**:
The Monorepo folder a Package sits in, named by the workspace glob that matched
it (apps, toolkits, devtools, packages). A filing convention, not architecture:
it never decides what may depend on what. In the Folders layout it is the box
its Packages are drawn in.
_Avoid_: Layer, lane, kind, Wrapper

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

**Stories badge**:
The marker on a Package whose Laymos Config declares a Stories path, so its
Embedded Laymos has Stories to read. Presence only, like the Laymos badge, and
never shown without it.

**Embedded Laymos**:
The full Laymos view of one Package's Project, opened by double-clicking the
Package, over the Monoverse canvas without leaving it, with the Project fixed
and a crumb back to the Monorepo in place of the project picker. Closing it
returns to the canvas exactly as it was left. It never adds the Project to the
Laymos Tool's own list.

**Package files**:
Every file git knows beneath a Package's folder, opened beside the canvas by
right-clicking the Package, as the Laymos File list is for a Module: one plain
tree, the README shown first, each changed file marked and readable as its
diff against the Base ref. There is no separate README or documentation view.
_Avoid_: Package README, code changes tab, source, documentation panel

**Monorepo files**:
Every file git knows in the whole Monorepo, opened by right-clicking the
Monorepo's own card or the empty canvas: the same File list as Package files,
the root README first and opened down to each Package, so a change in any
Package, or outside every Package, can be read and stepped through in one
place.
_Avoid_: project files, repo tree

**Package outline**:
The Monorepo's Package groups and Packages as one collapsible tree beside the
canvas, stopping at Packages, with a dot per Package change status. Selecting
there and selecting on the canvas are one selection.
_Avoid_: Package tree, package list

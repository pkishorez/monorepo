# CONTEXT — monoverse

Glossary for Monoverse: one Monorepo or Single Package shown as its folder
tree, because the folders are the forest the files cannot show. Definitions
only; no implementation detail.

## Language

**Monoverse**:
The DevTools Tool, and the collection of Monorepos and Single Packages a
developer has added to it, each shown as its Folder tree: which Packages it
holds, how its folders import each other, where they break their monoverse.json rules,
and what changed.
_Avoid_: Monorepo Tool, Workspace view, Laymos

**Monorepo**:
A folder whose Packages are listed by its `pnpm-workspace.yaml` or by the
`workspaces` field of its `package.json`. It is one of the two things a user
adds to Monoverse and the universe every one of its Packages belongs to. A
folder that lists them in neither place is not a Monorepo, and neither is a
monorepo nested inside another.

**Single Package**:
A folder with a `package.json` that lists no workspace packages. It is the
other thing a user adds to Monoverse, and it is its own one Package: opening
it goes straight to its Package view.
_Avoid_: standalone package, single-package repo, project

**Package Manager**:
The tool a Monorepo or Single Package is managed with: pnpm, npm, yarn, or
bun. It has no bearing on which Packages exist or how they depend on each
other.
_Avoid_: Workspace tool, client

**Package**:
One node of a Monorepo or Single Package; in a Monorepo, a folder matched by
its workspace globs that holds a `package.json`. Apps, libraries, toolkits
and devtools are all Packages. The Monorepo root's own manifest is not a
Package; a Single Package's root is its one Package.
_Avoid_: Workspace, member, app, project

**Package dependency**:
One Package naming another Package of the same Monorepo in any field of its
manifest, matched by name alone. How the version is written has no bearing;
sharing a name with a Package is what makes a dependency internal.
_Avoid_: workspace dependency, internal link

**Package cycle**:
Two or more Packages that depend on each other in a loop. A finding wherever
it appears, drawn red in the Repo view.
_Avoid_: circular dependency

**Folder tree**:
The git-known files of a Project, or of one Package, in their real folders.
Git-ignored files are never in it. It is what every Monoverse view draws;
everything else is drawn on it.
_Avoid_: file list, outline, graph

**Repo view**:
The Folder tree of a whole Monorepo with each Package closed into one node of
its own colour. Selecting a Package lights up the Packages it depends on and
those that depend on it.
_Avoid_: monorepo graph, package cards

**Package view**:
The Folder tree of one Package, every folder open to its files, entered by
double-clicking a Package in the Repo view, or by choosing it from the
Package menu.
_Avoid_: Embedded Laymos, drill-down

**Package menu**:
Top left beside the project's own menu in a Monorepo: the Package shown,
or All packages for the Repo view, listing both to go straight to another.
A Single Package has none.
_Avoid_: package switcher, package picker

**monoverse.json**:
The file beside a Package's `package.json` that turns its rules on, the
same for `monoverse lint` and for Monoverse: its Source roots, the files
it ignores, a preset or its own rules, and the exceptions and
restrictions it adds, each with its reason. A Package without one is
drawn but never checked.
_Avoid_: laymos.config.json, lint config

**Source root**:
A folder of a Package whose files its rules check: the `sourceRoots` of
its monoverse.json. Without a monoverse.json that can be read, the whole
Package is its one Source root.

**Ignored file**:
A file of a Package outside its Source roots: shown dimmed unless the
settings leave the ignored files out, and never checked. Its imports are
still drawn.
_Avoid_: excluded file, git-ignored file (never shown at all)

**Connection**:
Some file inside one folder importing some file inside another, drawn
between the two as the Folder tree is open. Selecting a folder shows only
the Connections that cross its border: to its siblings and to folders beside
its ancestors, never what happens inside it. A Connection to something inside
a closed folder lights that folder up with a count.
_Avoid_: edge, dependency (that is a Package dependency), link

**Uses / Used by**:
The two directions of a Connection from the selected folder: what it imports,
and what imports it. Drawn in two colours.

**Check**:
What a Package's monoverse.json makes of its imports at a branch, worked
out on the server by @kestack/monoverse, the engine `monoverse lint`
runs, on the branch's files on disk: its worktree, or for a branch none
has checked out, a copy of its commit. None without the file, a sentence
saying why when the file cannot be read, or its Violations.
_Avoid_: lint run, analysis

**Violation**:
One import, from a file its monoverse.json checks, that its rules or a
restriction forbid, or a contract that breaks them, with `monoverse
lint`'s own sentence saying why and what to do, at its line and column:
drawn red, and counted on the file, every folder above it, and the
Package. An exception that lets nothing through, or a restriction that
covers no file, is one on the monoverse.json itself. A Package cycle is
drawn red too, but is never a Violation.
_Avoid_: error, lint failure

**Project picker**:
Where a Project is chosen: the Projects already added, newest first, and
"Open a folder…", which walks folders from the home folder down and adds the
one chosen. It only picks; which branch is read is chosen in the view.
_Avoid_: project switcher, open dialog

**Branch**:
The branch whose files Monoverse shows. A branch some Worktree has checked
out is read from that Worktree's folder, uncommitted work included; any other
is read from git at its last commit, never checked out. It starts at the
branch the Project's own folder is on.
_Avoid_: ref, checkout

**Compare to**:
The branch changes are measured against: from where the Branch left it (their
merge-base) to the Branch. It starts at `main`, else `master`, else
`develop`. Uncommitted, the first choice, measures against the Branch's own
last commit, so only the work not yet committed shows; a Branch no Worktree
has checked out has none.
_Avoid_: Base ref, target branch

**Changes**:
The switch that marks each file by its Change status against Compare to, and
each folder by what changed inside it. Opening a changed file shows its diff.
_Avoid_: Git mode, Lens

**Change status**:
One file's standing against Compare to: added (green), modified (yellow) or
deleted (red). A deleted file is shown where it stood.

**Unchanged files**:
While Changes is on, how the files and folders the Branch left untouched are
drawn, in the tree and in a Folder view alike: shown as they are, dimmed
(the default) or hidden, leaving only what changed.
_Avoid_: noise filter

**Deleted files**:
While Changes is on, whether the files the Branch deleted are drawn where
they stood and listed when a folder is looked into. One choice for both.
_Avoid_: tombstones

**Folder view**:
A folder, the root included, looked into: its files as a tree of their
folders, drawn by the same settings as the tree, beside one file's diff,
or with Changes off its text. Opened from the selection bar, View changes
or Browse files; a Package in the Repo view is looked into for what changed
in it only.
_Avoid_: changes panel, file list

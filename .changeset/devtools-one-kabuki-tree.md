---
'@kestack/devtools': patch
---

DevTools is one Kabuki app of three composable Tools, and Monoverse shows a Project as its folder tree.

**Breaking**

- `devtools` only serves: `list-traces`, `get-trace`, `kabuki` and `skills`, and the shipped `devtools` skill, are gone.
- The `@kestack/devtools/lotel`, `/lotel/rpc` and `/lotel/telemetry` subpaths are gone; the package ships the binary only.
- Each Tool's RPC moved to its own path: `/rpc/lotel` and `/rpc/monoverse`. `/rpc` and `/story-evidence` no longer answer.
- Monoverse no longer opens Packages in Laymos and shows no Stories. Projects have no labels and no Worktree choice when picked; the branch is chosen in the view. Lotel's saved filters are kept under new keys, so filters saved before are lost once, and `?trace=` no longer opens a Trace.

**Changed**

- Lotel, Monoverse and Kabuki are each one Kabuki Actor that starts from its Input; the app composes them under one header.
- Monoverse's Project picker walks folders from the home folder down, as the code app's does, and names each Project by its `package.json` name.
- Monoverse shows the repository's folder tree with each Package as one node, and a Package's own tree on double-click. Selecting a folder shows its imports to and from its siblings and the folders beside its ancestors; a file importing a file directly in an ancestor folder is a Violation. Source roots come only from `sourceRoots` in a Package's `laymos.config.json`.
- Three controls sit top right: Branch reads any local branch, from its worktree or straight from git without checking it out; Compare to picks what changes are measured against; Changes marks added, modified and deleted files and the folders holding them. The place, branch included, is in the address.
- The tree is an outline on a canvas you pan and zoom. Selecting something draws arcs to what it uses and what uses it and dims the rest; a Package's row shows its folder's name over its own name and version, and only Changes colours names.
- Top left, the project menu and, in a monorepo, a Package menu: every Package and All packages, to go back to the repository. While Changes is on it lists the changed Packages first, each with its count, and dims or hides the rest as unchanged files are.
- A bar at the bottom holds the action for the selection, or the whole tree: Open package and View changes for a Package, Open file, View changes or Browse files. View changes turns Changes on when it is off. It opens a folder, the root included, as a tree of its changed files beside one file's diff; ←, →, a bar under the file and swipes step between files. On a phone a back button and a swipe right go from the diff to the list, then close.
- The canvas tree sits in a column at most 1024px wide; on a phone it scrolls within padded edges instead of panning. A toggle by the zoom controls expands or collapses every folder, and a button on a folder's row expands or collapses everything inside it; the folder view has the same.
- The view settings, the same for the canvas and the folder view: whether unchanged files are shown, dimmed or hidden, whether deleted files are drawn, and whether a Package's ignored files (outside its source roots) are. Wrap lines and Side by side sit in the diff's own header. On a phone every setting is in one sheet.

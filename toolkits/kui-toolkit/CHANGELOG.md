# kui-toolkit

## 0.0.4

### Patch Changes

- [#47](https://github.com/pkishorez/monorepo/pull/47) [`2acc4fc`](https://github.com/pkishorez/monorepo/commit/2acc4fc22414db10ee6ba52c67089193a4df81ef) Thanks [@pkishorez](https://github.com/pkishorez)! - Add `devtools snapshot`: it analyzes one Laymos Project, marks what its commits changed since a Base ref (default `main`; uncommitted work is left out), and draws the changed Modules and their Layers to a PNG in headless Chromium through the optional peer `playwright-core`, without starting a server. The bundled Snapshot page is a second entry beside the application; the picture is sized to its content and capped by `--max-width` and `--max-height`, and drawn dark unless `--theme light` or `DEVTOOLS_THEME=light` is given. `kui-toolkit` gains `ArchitectureSnapshot`, the still Module graph the page draws, `ModuleGraph` gains a non-interactive mode with an `onFitted` callback, and the changes-only filter of the workspace is shared as `changedArchitecture`.

  The Modules and Layers trees read more clearly: every row's icon sits in the same box so rows at one depth line up, a guide line runs down from each parent, the indent is wider, and the Modules tree lists folders before files.

- [#52](https://github.com/pkishorez/monorepo/pull/52) [`3efa7a0`](https://github.com/pkishorez/monorepo/commit/3efa7a04010e8cd97d2abd1f421459f9aac9e4bc) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Laymos toolbar puts the Git changes menu first, then the view options and the LayerGraph menu, so the Git menu sits in the same place as in Monoverse.
- Updated dependencies [[`541bb24`](https://github.com/pkishorez/monorepo/commit/541bb243030a45f6ca33e0cfe482ee70637c56c7)]:
  - std-toolkit@0.0.12
  - @pkishorez/lotel@0.0.12
  - @pkishorez/effect-tracer@0.0.12
  - @pkishorez/flow@0.0.12
  - laymos@0.0.12

## 0.0.3

### Patch Changes

- Updated dependencies [[`b7a5d3d`](https://github.com/pkishorez/monorepo/commit/b7a5d3de83d2490b054370eb3d3e1ae957e8e795)]:
  - std-toolkit@0.0.11
  - @pkishorez/lotel@0.0.11
  - @pkishorez/effect-tracer@0.0.11
  - @pkishorez/flow@0.0.11
  - laymos@0.0.11

## 0.0.2

### Patch Changes

- [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21) Thanks [@pkishorez](https://github.com/pkishorez)! - Add the Monoverse block: the complete explorer UI and data types for a bird's-eye view of a pnpm monorepo, with Packages laid out by dependency rank, filterable runtime, dev, peer, and optional connections, dependency cycles, and drill-down into Laymos. It marks new and modified Packages against a Base ref on the canvas and in the Package tree, and a Package's source dialog shows its README beside its files with a diff for every changed file. Package cards no longer show their Package group label.

  Add the `git-changes` and `source-explorer` blocks, shared by Laymos and Monoverse: one git menu, one set of change markers, and one source dialog. The Laymos Files tab also lists Unanalyzed files, shown muted.

  Add the `auth` block that the auth-toolkit pages are built on, with one width, one loader, and no layout shifts.

  Add adaptive compact layouts for the Lotel and Laymos workspaces, with a bottom tool bar, drill-down pages, and sheet-based controls below 768px.

  Show unchanged modules by default, hide module connections initially, and use compact lowercase monospace navigation controls across the Laymos and Monoverse workspaces.

  Style document scrollbars with a thin, theme-aware thumb and avoid reserving scrollbar space when it is not needed.

  Breaking: `DevToolsPanel` requires `runtime`, the swim-lane input changes from the old recorded-flow shape to a `@pkishorez/flow` Projection, and `onActivityClick` is removed.

- Updated dependencies [[`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21), [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21), [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21), [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21), [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21), [`d7a9f63`](https://github.com/pkishorez/monorepo/commit/d7a9f63b89b3ad7b047fed220cc3d9e96dae1686)]:
  - @pkishorez/effect-tracer@0.0.10
  - @pkishorez/flow@0.0.10
  - laymos@0.0.10
  - @pkishorez/lotel@0.0.10
  - std-toolkit@0.0.10
  - use-effect-ts@0.0.11

## 0.0.1

### Patch Changes

- [`7b8db1e`](https://github.com/pkishorez/monorepo/commit/7b8db1e602fb5def113ace65e70bf65688c5e215) Thanks [@pkishorez](https://github.com/pkishorez)! - Publish the former private frontend package as kui-toolkit, with source
  exports for React components, blocks, forms, hooks, utilities, and styles.
  Register Tailwind sources from the installed package, declare consumer
  dependencies and compatible peers, and document TanStack Start integration.

## 0.0.3

### Patch Changes

- Improve ui. Fix edge logic.

## 0.0.2

### Patch Changes

- Rebuild the feature model so selecting any feature renders a single-rooted, top-down cone derived from the real import graph, instead of an inferred pile of disconnected roots.

## 0.0.1

### Patch Changes

- Bundle typescript as well, for depcruise to work properly. Fix ui for frontend.

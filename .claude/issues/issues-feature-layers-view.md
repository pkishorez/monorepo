# Issues: feature-layers-view

Source: `this conversation`
Repo root: `/Users/kishorepolamarasetty/CAREER/MINE/monorepo`
Project commands: `cd packages/frontend && npx vitest run` (test) · `pnpm lint` (lint, runs `vp check && tsc --noEmit`) · `pnpm dev` (run, launches React Cosmos)

## North Star

We're adding a new **Features** tab to the dependency-cruiser visualization that shows how every feature cuts _across_ the architectural layers. The layers become vertical slices laid out left-to-right in the same order as the Layers tab; within each slice the layer's modules appear as a folder hierarchy (leaves = modules). A chip bar above the slices lists features plus synthetic filter lenses; hovering/pinning a chip highlights that feature's owned (primary) and consumed (muted) modules across all slices, while clicking a module highlights the chips that touch it. The one constraint we won't violate: **both the Layers tab and this new tab derive from a single render-agnostic layer abstraction** — we don't fork layer logic. "Good" looks like: open the Features tab, hover a feature chip, and watch its modules light up column-by-column across the layers, with the file panel showing its files. The current 3-axis bipartite Features view moves to a third "Features (deprecated)" tab, kept until the new view proves itself.

## Glossary

- **Layer** — an architectural tier (e.g. routes, services). A module belongs to exactly one layer; identity is `layer::name` (`moduleKey`).
- **Stack** — an ordered chain of layers (`config.stacks`). Multiple stacks can run in parallel; a layer appearing in more than one stack is a **shared layer**.
- **Slot** — one vertical slice in the new view = one logical layer position. A slot holds 1 section normally; parallel layers at the same position become multiple divider-separated **sections**.
- **Section** — one layer within a slot, carrying its pre-resolved `ModuleNode[]`.
- **Module** — a folder with a visibility tier and optional owning feature (`ModuleNode` in `model/modules.ts`). Leaves of the slice trees.
- **Feature** — a product capability spanning modules across layers. `featureFocus()` splits a feature's modules into **owned** and **consumed** sets.
- **Visibility tier** — `public` (emerald) / `shared` (amber) / `private` (violet); see `VISIBILITY_COLOR`.
- **Filter chip** — synthetic, non-feature highlight lens: Shared/Unowned (`feature===null`), Breached (`isBreached`), Public surface (`visibility==='public'`).

## Conventions

- Files: kebab-case only (per `/Users/kishorepolamarasetty/CAREER/MINE/monorepo/CLAUDE.md`).
- Comments only when necessary; JSDoc for exported functions/types.
- **Deep-module discipline**: each new folder is a deep module — a narrow `index.ts` barrel exporting only what callers need (functions, not types unless a caller can't compile without naming them). Internal files are not imported across folder boundaries.
- Model/view separation mirrors the existing file-tree feature: a pure model-builder produces a view-model object; the renderer consumes it via props and calls no model functions.
- Tests: vitest 4.1.5 (devDependency in `packages/frontend/package.json`; no test script — run with `npx vitest run` from `packages/frontend`). No existing tests in this feature; use standard vitest `describe/it/expect`, co-located as `<name>.test.ts`.

---

## Task: Shared layer model abstraction [AFK]

**Why.** The North Star forbids forking layer logic. Today `computeLayerLayout` in `graph/layer/layer-layout.ts` computes stack detection, shared-layer spanning, and ordering _inline_, coupled to ReactFlow `Node`/`Edge` output. The new Features tab needs the same layer structure (ordered slots, parallel-layer sections, modules resolved into each layer) without any coordinates or ReactFlow types. This slice extracts that structure once so both tabs consume it.

**What.** A new deep module `model/layer-model/` exporting a pure builder `buildLayerModel(config, summary)` that returns a render-agnostic `LayerModel`: an ordered list of slots, each with one or more sections, each section carrying its layer name, owned folder paths, and the `ModuleNode[]` resolved into that layer. Then refactor `computeLayerLayout` to derive its nodes/edges from `LayerModel` instead of computing slot/section/ordering structure itself — the Layers tab must render identically. Edges/violations stay OUT of `LayerModel` (the Layers view keeps computing them separately; the new view draws none).

**Read first.**

- `packages/frontend/src/components/blocks/dependency-cruiser-viz/graph/layer/layer-layout.ts` — current inline stack detection, `computeLevels()` ordering, shared-layer spanning; the logic to extract. Note exported types `LayerNodeData`, `StackHeaderNodeData`, `HandleOffset`.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/modules.ts` — `ModuleNode` type, `allModules(config, summary)`, `moduleKey(layer, name)`; modules are resolved per-layer here.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/index.ts` — barrel pattern to follow for the new `layer-model/index.ts`.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/types.ts` — `VisualizationConfig`, `VizSummary`, `config.stacks` shape.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/graph/layer/layer-graph-panel.tsx` — confirms `computeLayerLayout` is the only consumer of the layout output.

**Interface produced.**

- `buildLayerModel(config: VisualizationConfig, summary?: VizSummary): LayerModel` — exported from `model/layer-model/index.ts`.
- `type LayerModel = { slots: LayerSlot[] }`
- `type LayerSlot = { index: number; sections: LayerSection[] }`
- `type LayerSection = { layer: string; paths: readonly string[]; modules: ModuleNode[] }`
- `computeLayerLayout` keeps its existing signature `(config, summary?, selectedLayer?) => { nodes: Node[]; edges: Edge[] }` — unchanged for callers.

**Inputs from predecessors.** None — can start immediately.

**Out of scope.**

- Do NOT change anything under `files/` (Task 2 owns it).
- Do NOT change `graph/graph-panel.tsx`, `use-dependency-cruiser-viz.ts`, or the feature view (Task 3 owns those).
- Do NOT add edges/violations to `LayerModel`.
- Do NOT change the visual output of the Layers tab.

**Acceptance criteria.**

- [ ] `buildLayerModel` returns slots in the same left-to-right order the Layers view uses today; parallel layers at one position produce multiple sections in one slot; each section's `modules` equals the `ModuleNode`s whose layer matches.
- [ ] `computeLayerLayout` derives slot/section/ordering from `buildLayerModel` (no duplicated stack-detection logic).
- [ ] Characterization test: snapshot `computeLayerLayout(config, summary)` node+edge output for the fixture data BEFORE refactor, assert byte-identical AFTER.
- [ ] `pnpm lint` passes (`vp check && tsc --noEmit`).

**Done when.** Test `layer-model.test.ts` passes (builder structure + characterization snapshot of `computeLayerLayout` unchanged) and `pnpm lint` succeeds.

---

## Task: Module-tree model and renderer generalization [AFK]

**Why.** Each layer section in the new view renders its modules as a collapsible folder hierarchy whose leaves are modules (not files). The existing file-tree renderer already wires up exactly what we need — nested collapse/expand, owned/consumed highlight sets, tier coloring, stable keys — but bottoms out at files. This slice produces a module-level tree and makes the renderer reusable for it, so Task 3 doesn't re-implement tree rendering.

**What.** A new deep module `files/module-tree/` exporting `buildModuleTree(modules)` that turns a `ModuleNode[]` into a `FileTreeNode[]`-shaped tree where intermediate nodes are pure folder-path segments (`nodeKind: 'other'`, not selectable) and leaves are modules (`nodeKind: 'module'`, carrying the module key + visibility + fileCount). Then generalize the existing `FileTreeView` renderer so it can render such a module tree driven by highlight sets keyed on module identity — extracting a shared rendering core if the file-level renderer currently hard-codes file semantics. The file-tree panel's existing behavior must be unchanged.

**Read first.**

- `packages/frontend/src/components/blocks/dependency-cruiser-viz/files/model/file-tree-data.ts` — `buildFileTree`, `collectModuleCollapsedIds`; tree-construction primitives to reuse/mirror.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/files/model/file-tree-types.ts` — `FileTreeNode`, `NodeKind` (`'layer' | 'module' | 'other'`), `FileTreeViewModel`.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/files/view/file-tree-view.tsx` — `FileTreeView` props (highlight sets, `colorByTier`, `fileVisibility`, `moduleVisibility`, expansion), `renderNodes`, `filterTree`; the renderer to generalize.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/modules.ts` — `ModuleNode`, `moduleKey`.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/visibility.ts` — `VISIBILITY_COLOR` for tier coloring.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/files/index.ts` — barrel pattern.

**Interface produced.**

- `buildModuleTree(modules: ModuleNode[]): FileTreeNode[]` — exported from `files/module-tree/index.ts`. Leaves carry the module key (in the node id) so highlight sets can match by `moduleKey`.
- A renderer usable for module trees: either `FileTreeView` accepting a module tree + module-keyed highlight sets, OR a thin `ModuleTreeView` wrapper over a shared rendering core. Export whichever Task 3 imports from `files/module-tree/index.ts` (re-export if the core lives under `files/view/`).

**Inputs from predecessors.** None — can start immediately. (Consumes `ModuleNode` from existing `model/modules.ts`, not from Task 1.)

**Out of scope.**

- Do NOT change `model/` or `graph/layer/` (Task 1 owns them).
- Do NOT change `graph/graph-panel.tsx`, `use-dependency-cruiser-viz.ts`, or build the new view (Task 3).
- Do NOT change the existing file-level behavior of `FileTreePanel` / `getFileTreeViewModel` — the file tree must look and behave exactly as before.

**Acceptance criteria.**

- [ ] `buildModuleTree` collapses single-child folder chains into path segments, emits module leaves with `nodeKind: 'module'` and the module key recoverable from the node, intermediate folders as `nodeKind: 'other'`.
- [ ] The generalized renderer renders a module tree with: tier coloring at rest, owned (primary) vs consumed (muted) highlight by module key, dimming of unhighlighted leaves, collapse/expand.
- [ ] Existing file-tree rendering is unchanged (no prop removed/repurposed that `FileTreePanel` relies on).
- [ ] `pnpm lint` passes.

**Done when.** Test `module-tree.test.ts` passes (tree shape: folder-segment intermediates + module leaves with recoverable keys) and `pnpm lint` succeeds.

---

## Task: Feature-layers view and tab wiring [HITL]

**Why.** This is the deliverable the North Star describes: the cross-cutting Features tab. It composes Task 1's `LayerModel` (the slices) and Task 2's module tree + renderer (each slice's content) into a new DOM/CSS canvas with a chip bar, and wires it in as the third canvas mode while demoting the old bipartite view. HITL because it's a new visual surface that needs eyeball review in Cosmos.

**What.** A new deep module `graph/feature-layers/` exporting one panel component. It renders, in plain DOM/CSS (no ReactFlow, no edges):

- A **chip bar** above the canvas, full-width, two visually separated zones: **Features** (real features, ordered by owned-module count descending) and **Filters** (Shared/Unowned, Breached, Public surface — visually distinct from feature chips).
- Horizontal row of **vertical slices**, one per `LayerModel` slot, in slot order. Parallel-layer slots show divider-separated sections. Each section renders Task 2's module tree. Horizontal page scroll across slices; independent vertical scroll per slice; sticky section headers; collapsible subtrees. A layer section with no modules shows its header + a quiet empty state (does not collapse away).
- **Resting state**: modules colored by visibility tier.
- **Hover chip** (transient) / **click chip** (pins, sticky, single-active): highlights that chip's modules across all slices — owned in primary color, consumed muted, everything else dimmed; drives the existing file-panel `ownedFiles`/`consumedFiles` highlighting.
- **Click module** (pins, single-active per axis): highlights the chips that own/consume it (inverse direction) and keeps its files in the file panel.

Then extend `CanvasMode` to three values, turn the `ViewModeToggle` into three tabs (`Layers`, `Features`, `Features (deprecated)`), make the new Features tab the one shown for `'features'`, and route the existing `FeatureGraphPanel` to the deprecated tab.

**Read first.**

- `packages/frontend/src/components/blocks/dependency-cruiser-viz/use-dependency-cruiser-viz.ts` — `CanvasMode` type, `State`, reducer (`select-feature`/`select-module` auto-switch to `'features'`), actions `selectFeature`/`selectModule`/`hoverGraphModule`/`setCanvasMode`, `GraphHover`. Extend `CanvasMode` here.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/graph/graph-panel.tsx` — `GraphPanel`, `ViewModeToggle`, the `canvasMode === 'features'` switch; where the third tab + new panel wire in.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/features.ts` — `featureFocus(summary, feature)` → `{ owned, consumed }` (module keys); `featureFiles`/`featureFileSets` for file-panel highlighting; owned-count for chip ordering.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/modules.ts` — `ModuleNode` fields `feature`, `isBreached`, `visibility` for the three filter predicates.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/layer-model/index.ts` — `buildLayerModel` / `LayerModel` (from Task 1).
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/files/module-tree/index.ts` — `buildModuleTree` + renderer (from Task 2).
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/graph/feature/feature-graph-panel.tsx` — the view being demoted; its props signature for the deprecated tab.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/dependency-cruiser-viz.fixture.tsx` — Cosmos fixture for visual review.

**Interface produced.**

- `FeatureLayersPanel` (props: `config`, `summary?`, `selectedFeature`, `selectedModule`, `onSelectFeature`, `onSelectModule`, plus a transient hover handler) — exported from `graph/feature-layers/index.ts`.
- `CanvasMode` extended to `'layers' | 'features' | 'features-deprecated'` (confirm final string for the deprecated value when implementing).

**Inputs from predecessors.**

- Task `Shared layer model abstraction` produces `buildLayerModel(config, summary): LayerModel` at `model/layer-model/index.ts`. Call it to get `slots`/`sections` for the slice layout.
- Task `Module-tree model and renderer generalization` produces `buildModuleTree(modules): FileTreeNode[]` and a module-tree renderer at `files/module-tree/index.ts`. Feed each section's `modules` to `buildModuleTree`, render with the renderer, pass owned/consumed highlight sets keyed by `moduleKey`.

**Out of scope.**

- Do NOT modify `graph/layer/` or `model/layer-model/` internals (Task 1).
- Do NOT modify `files/` internals beyond importing from `files/module-tree/index.ts` (Task 2).
- Do NOT delete the existing `FeatureGraphPanel` — it moves to the deprecated tab, kept for now.
- Do NOT implement feature-chip grouping by responsibility (deferred to a future session) — chips are a flat, arbitrarily-ordered list within the Features zone.
- Do NOT draw cross-slice connecting edges — highlighting only.

**Acceptance criteria.**

- [ ] Three tabs render; `Features` shows `FeatureLayersPanel`, `Features (deprecated)` shows `FeatureGraphPanel`, `Layers` unchanged.
- [ ] Slices render in `LayerModel` slot order; parallel layers show divider-separated sections; module trees render as folder hierarchies with module leaves; empty sections show a quiet empty state.
- [ ] At rest, modules are tier-colored; hovering/pinning a feature chip highlights owned (primary) + consumed (muted) across slices and dims the rest; the file panel shows that feature's owned/consumed files.
- [ ] Feature chips appear in the Features zone ordered by owned-module count descending; the three filter chips appear in a separate Filters zone and each highlights its predicate set; chip selection is single-active.
- [ ] Clicking a module pins it, highlights the chips that own/consume it, and keeps its files in the file panel.
- [ ] `pnpm lint` passes.

**Done when.** `pnpm dev` (Cosmos) shows the three tabs; in the Features tab, hovering a feature chip lights its modules column-by-column across slices with the file panel updating, and clicking a module highlights its chips; `pnpm lint` succeeds. Human reviews the visual result.

---

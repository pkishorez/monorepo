# Issues: feature-trees

Source: `this conversation` (design grill + ADR `packages/depcruise-viz/docs/adr/0001-feature-trees-over-module-visibility.md`)
Repo root: `/Users/kishorepolamarasetty/CAREER/MINE/monorepo`
Project commands:

- depcruise-viz (backend): `cd packages/depcruise-viz && pnpm test` (vitest) · `pnpm lint` (vp check + tsc) · `pnpm lint:depcruise` (build + `node dist/cli/index.js lint`)
- frontend: `cd packages/frontend && pnpm lint` (vp check + `tsc --noEmit`) · `pnpm dev` (react-cosmos, for visual check of `.fixture.tsx`)

## North Star

We're rebuilding depcruise-viz's feature model so a developer looking at any one feature sees exactly the modules it spans as a single-rooted, top-down graph — not today's inferred pile of disconnected roots. A **module** becomes just a named unit in a layer (no `private/shared/public`); a **feature** is an explicitly declared tree (`root` + member module names) whose edges are _derived_ from the real import graph; **sharing is emergent** (a module named by ≥2 features); **barrels** are exempt from closure. The one constraint we won't slip: a feature's declared membership is the single source of truth — viz and lint never re-infer it. "Good" = selecting a feature shows a clean single-root cone, and lint fails when a real import edge is claimed by no feature.

## Glossary

- **Module** — `(name, layer, path)` + intrinsic `barrel?: boolean`. No owner, no visibility. Within a layer, declared modules exhaustively cover files.
- **Feature** — a declared rooted DAG: `{ name, root, modules[] }`. `root` and each member are module names (`layer::name` or the bare path-tail name used in `VisualizationConfig.modules[].name`). One feature per user-facing entry point → single-rooted.
- **Shared module** — a module named by ≥2 features. Emergent; no marker.
- **Barrel** — a module flagged `barrel: true`; exempt from closure/coverage. Only its edges into a feature's members are traced; the rest ignored.
- **Feature closure (lint contract)** — (1) a non-barrel module named by exactly one feature must have all its real out-edges as members of that feature; (2) at a shared module or barrel, closure relaxes to per-feature edges; (3) global coverage: every real module→module edge must be claimed by ≥1 feature, except edges leaving a barrel. An unclaimed non-barrel edge is a violation.
- **Derived edge** — an edge in a feature's graph, computed as the real `moduleEdges` restricted to that feature's member set (never authored).

## Conventions

- Kebab-case filenames only; JSDoc on exported functions/types; comments only where non-obvious (see repo `CLAUDE.md`).
- **Ponytail (minimal structure):** no new files/folders unless the task deletes more than it adds. New backend logic lands in the existing file that owns the concern (closure lint → `summarize-cruise-result.ts`, plus at most ONE new sibling if that file exceeds ~250 lines). Frontend changes edit existing `model/*.ts` and `graph/feature-layers/*.tsx`. **The `computeFeatureGraphLayout` engine in `graph/feature-layers/feature-graph-layout.ts` is reused — do not rewrite the layout.**
- **Same visualization level:** layer swimlanes, barycenter column ordering, family clustering, and cycle/breach edge styling all stay. Only (a) how membership is sourced and (b) node encoding change.
- `packages/depcruise-viz/src/types.ts` (backend) and `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/types.ts` (frontend) are **two separate copies** of the shared shapes. Backend tasks edit the former; frontend tasks edit the latter. Keep the `VisualizationConfig`/`VizSummary` shapes identical across both.
- Effect-TS is used in the CLI/cruise layer; follow existing style in `src/cli/run.ts`. Do not touch `repos/effect-smol`.

---

## Task: Strip grouping from config, analysis, and UI [AFK]

**Why.** Grouping is unused in both real configs (`packages/depcruise-viz/depcruise.config.ts` and the booking-service config both declare a single `layersTopDown` with no `group()`), and it adds `group` fields, cross-group detection, and group-band rendering that every later task would otherwise have to carry. Deleting it now makes tasks 2–7 start from a smaller surface. Serves the North Star by removing noise unrelated to feature trees.

**What.** Remove the `group` concept end-to-end: the `group()` builder, `group` fields on types, cross-group edge detection, and group-band rendering in the layer grid. A config that never used groups must behave identically after.

**Read first.**

- `packages/depcruise-viz/src/authoring/group.ts` — the `group()` builder to delete.
- `packages/depcruise-viz/src/authoring/index.ts`, `src/index.ts` — re-export lists to prune.
- `packages/depcruise-viz/src/types.ts` — `LayerStackConfig.group?`, `VisualizationConfig.stacks[].group?`, `VisualizationConfig.modules[].group?`, `DEFAULT_GROUP` const.
- `packages/depcruise-viz/src/analyze/detect-cross-group-edges.ts` (delete whole file: `detectCrossGroupEdges`, `assertGroupIsolation`, `CrossGroupEdge`) and `src/analyze/index.ts`.
- `packages/depcruise-viz/src/compile/to-visualization-config.ts` — where `group` is stamped onto stacks/modules.
- `packages/depcruise-viz/test/groups.test.ts` (delete).
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/layer-model/index.ts` — `LayerGrid.groupBands`, `rowGroups`, `LayerGroupBand`, and their construction in `buildLayerGrid`.
- `packages/frontend/src/components/blocks/dependency-cruiser-viz/graph/feature-layers/feature-layers-panel.tsx` — group-band rendering that reads `groupBands`/`rowGroups`.
- `packages/depcruise-viz/CONTEXT.md` — `## Group`, `## Default group`, `## Shared layer`, `## Cross-group edge` sections.

**Interface produced.**

- `VisualizationConfig` (both copies): no `group` on `stacks[]` or `modules[]`. `LayerStackConfig`: no `group`.
- `src/index.ts` / `src/analyze/index.ts`: `group`, `detectCrossGroupEdges`, `assertGroupIsolation`, `CrossGroupEdge` no longer exported.
- `LayerGrid`: no `groupBands`, no `rowGroups`, no `LayerGroupBand` (single implicit stack region only).

**Inputs from predecessors.** None — can start immediately.

**Out of scope.**

- Do not touch `visibility`/`sharedWith`/`feature` fields yet (Task 2 owns those in the same `types.ts` — this task runs first, serially).
- Do not change layer ordering / `layersTopDown` semantics.
- Do not edit `depcruise.config.ts` or the booking-service config (Tasks 8/9).

**Acceptance criteria.**

- [ ] `git grep -n "group" packages/depcruise-viz/src packages/frontend/src/components/blocks/dependency-cruiser-viz` returns no references to the removed API (comments/unrelated words aside).
- [ ] `cd packages/depcruise-viz && pnpm test` passes (groups.test.ts removed, others green).
- [ ] `cd packages/depcruise-viz && pnpm lint` and `cd packages/frontend && pnpm lint` pass.

**Done when.** Both packages' `pnpm lint` pass and depcruise-viz `pnpm test` is green with `groups.test.ts` deleted.

---

## Task: New config model — types + authoring builders [AFK]

**Why.** This freezes the authoring contract and the `VisualizationConfig`/`VizSummary` shapes that every downstream task (compile, analyze, CLI, frontend) codes against. It is the chokepoint; front-loading all type changes here lets Tasks 3–5 and 6 diverge.

**What.** Retire module visibility and inferred feature ownership from the config DSL. A **module** is `(path)` + optional `barrel`. A **feature** is `feature(name, { root, modules, description? })`. Add the closure-violation types that analysis will emit.

**Read first.**

- `packages/depcruise-viz/src/types.ts` — `ModuleDecl`, `Feature`, `FeatureConfig`, `ProjectConfig`, `VisualizationConfig`, `VizSummary`, `Breach`, `BreachReason`, `FeatureEdge`, `FeatureModuleEdge`, `ModuleCoverage`.
- `packages/depcruise-viz/src/authoring/module.ts` — current `module(path,{feature,visibility,sharedWith})` + its validation.
- `packages/depcruise-viz/src/authoring/feature.ts` — current `feature(name, config)`.
- `packages/depcruise-viz/test/module-visibility.test.ts` — the visibility/breach assertions to replace.
- `packages/depcruise-viz/CONTEXT.md` — `## Module`, `## Feature`, `## Barrel`, `## Feature closure` (already written; the type shapes must match these definitions).
- `packages/depcruise-viz/docs/adr/0001-feature-trees-over-module-visibility.md` — the decision this implements.

**Interface produced.**

- `module(path: string, opts?: { barrel?: boolean }): ModuleDecl` where `ModuleDecl = { path: string; barrel: boolean }`. Throws on empty path.
- `feature(name: string, opts: { root: string; modules: string[]; description?: string }): Feature` where `Feature = { kind: 'feature'; name: string; root: string; modules: readonly string[]; config: { description?: string } }`. Throws on empty name, empty `root`, or `root` not present in `modules`.
- `Visibility` type, `sharedWith`, `feature?` on modules, `Breach`, `BreachReason`, `FeatureEdge`, `FeatureModuleEdge` — **removed**.
- `VisualizationConfig.modules[]` = `{ path; name; layer; barrel: boolean }`. `VisualizationConfig.features[]` = `{ name; description?; root; modules: string[] }`.
- New `VizSummary.featureGraphs: Array<{ feature: string; root: string; nodes: string[]; edges: Array<{ from: string; to: string; kind: 'legal' | 'breach' }> }>` (derived per-feature member graph; `nodes`/`from`/`to` are `layer::name` keys).
- New `VizSummary.closureViolations: FeatureClosureViolation[]` where `FeatureClosureViolation = { reason: 'unclaimed-edge' | 'closure-escape' | 'multi-root' | 'no-root' | 'uncovered-file'; feature?: string; fromModule?: string; toModule?: string; fromFile?: string; toFile?: string; detail: string }`.
- `VizSummary`: keep `violations`, `layerOrphanFiles`, `ignoredFiles`, `coveredFiles`, `moduleCoverage` (drop `feature`/`visibility`/`sharedWith` from `ModuleCoverage`, keep `module`/`layer`/`files`), `coverageGaps`, `emptyModules`, `conflicts`, `moduleEdges`. Remove `breaches`, `featureEdges`, `featureModuleEdges`.

**Inputs from predecessors.** Task `Strip grouping` produces a `types.ts` with no `group` fields and a pruned `src/index.ts`. Edit that version; do not re-add `group`.

**Out of scope.**

- Do not implement compilation or analysis logic (Tasks 3–4 populate `featureGraphs`/`closureViolations`). This task only defines their types and the builders + rewrites the authoring test.
- Do not touch the frontend copy of `types.ts` (Task 6).

**Acceptance criteria.**

- [ ] `module('src/x')` returns `{ path: 'src/x', barrel: false }`; `module('src/x', { barrel: true })` sets `barrel: true`; `module('')` throws.
- [ ] `feature('f', { root: 'a', modules: ['a', 'b'] })` succeeds; `feature('f', { root: 'z', modules: ['a'] })` throws (root not a member); `feature('', ...)` throws.
- [ ] `test/module-visibility.test.ts` is replaced by `test/authoring.test.ts` asserting the above; `pnpm test` passes.
- [ ] `pnpm lint` (tsc) passes with no references to `Visibility`/`sharedWith`/`Breach` in `src/types.ts` or `src/authoring`.

**Done when.** `test/authoring.test.ts` passes and `packages/depcruise-viz` `pnpm lint` succeeds.

---

## Task: Compile — resolve barrel + feature trees, drop breach rules [AFK]

**Why.** Compilation turns the new DSL into the `VisualizationConfig` the frontend renders and the dependency-cruiser ruleset that enforces layer ordering. Without it the new `module`/`feature` builders produce data nothing consumes.

**What.** `toVisualizationConfig` resolves modules (name from path tail relative to its layer, `barrel` passthrough) and features (`root` + `modules`), validating membership. `toDependencyCruiserConfig` keeps layer-ordering forbidden rules and removes all visibility/breach rule generation.

**Read first.**

- `packages/depcruise-viz/src/compile/to-visualization-config.ts` — current resolution (module→layer path check, name derivation, feature-reference validation).
- `packages/depcruise-viz/src/compile/to-dependency-cruiser-config.ts` — current forbidden-rule generation (layer rules + visibility breach rules).
- `packages/depcruise-viz/src/compile/validate-layer-ordering.ts` — layer ordering validation (keep).
- `packages/depcruise-viz/src/types.ts` (post-Task-2) — target `VisualizationConfig` shape.

**Interface produced.**

- `toVisualizationConfig(config: ProjectConfig): VisualizationConfig` — populates `modules[] = {path,name,layer,barrel}` and `features[] = {name,description?,root,modules}`. Throws when: a declared module path sits under no layer; a feature `root` or member name is not a declared module name; a feature has no members.
- `toDependencyCruiserConfig(rules: Rule[]): DependencyCruiserConfig` — `{ forbidden }` containing only layer-ordering rules (no visibility rules).

**Inputs from predecessors.** Task `New config model` produces `ModuleDecl = {path,barrel}`, `Feature = {name,root,modules,config}`, and the new `VisualizationConfig` type in `src/types.ts`. Consume those exact shapes.

**Out of scope.**

- Do not compute `featureGraphs`/`closureViolations` — that is post-cruise analysis (Task 4). Compilation is pre-cruise.
- Do not edit `src/analyze/*` or `src/cli/*`.

**Acceptance criteria.**

- [ ] A config with `feature('f',{root:'a.controller',modules:['a.controller','svc']})` and matching `module()` decls compiles to a `VisualizationConfig` whose `features[0]` has `root:'a.controller'` and `modules:['a.controller','svc']`.
- [ ] `module('src/x', { barrel: true })` under layer `handlers` yields `{name:'x',layer:'handlers',barrel:true}`.
- [ ] `toDependencyCruiserConfig` output `forbidden` contains layer-ordering rules only (no rule name referencing visibility/shared/private).
- [ ] `pnpm test` (existing compile-adjacent tests updated) and `pnpm lint` pass.

**Done when.** Compile tests pass and `pnpm lint` succeeds in `packages/depcruise-viz`.

---

## Task: Analyze — closure lint + derived feature graphs [AFK]

**Why.** This is where the North Star's guarantee is enforced: every real import edge is claimed by some feature, each feature is a single-rooted cone, and the per-feature graph the UI draws is derived from declared membership. Replaces the entire visibility/breach machinery.

**What.** `summarizeCruiseResult` computes, from `moduleEdges` + declared feature membership: (a) `featureGraphs` — per feature, the member node set and derived edges (real edges restricted to members; barrel out-edges to non-members dropped); (b) `closureViolations` per the Feature-closure contract; (c) the single-root check.

**Read first.**

- `packages/depcruise-viz/src/analyze/summarize-cruise-result.ts` — current summary build; the `enforce()` block (breaches/featureEdges/featureModuleEdges) is removed and replaced.
- `packages/depcruise-viz/src/types.ts` (post-Task-2) — `VizSummary.featureGraphs`, `closureViolations`, `FeatureClosureViolation`.
- `packages/depcruise-viz/CONTEXT.md` — `## Feature closure`, `## Barrel` (the exact rules to implement).
- `packages/frontend/.../model/module-graph.ts` — `moduleFamily` + containment-edge suppression logic (mirror the same edge-scoping so backend `featureGraphs` and frontend agree).

**Interface produced.**

- `summarizeCruiseResult(cruiseResult, visualization): VizSummary` — populates `featureGraphs` and `closureViolations`:
  - **unclaimed-edge**: a real non-barrel-origin `moduleEdge` present in no feature's derived edge set → `{reason:'unclaimed-edge', fromModule, toModule, detail}`.
  - **closure-escape**: a module named by exactly one feature (non-barrel) whose real out-edge target is not a member of that feature → `{reason:'closure-escape', feature, fromModule, toModule}`.
  - **no-root / multi-root**: a feature whose member set has zero / more-than-one node with no in-member inbound edge (barrel roots excepted per contract) → `{reason, feature, detail}`.
  - **uncovered-file**: reuse existing `coverageGaps` computation; emit as violation only if you fold it in (else leave `coverageGaps` as-is and do not duplicate).
- Barrel handling: for a barrel node, its out-edges are exempt from unclaimed-edge and closure-escape; only edges into a feature's declared members appear in that feature's `featureGraphs` edges.

**Inputs from predecessors.** Task `Compile` produces a `VisualizationConfig` whose `features[]` carry `root`+`modules` and whose `modules[]` carry `barrel`. Task `New config model` defines `featureGraphs`/`closureViolations`/`FeatureClosureViolation` in `VizSummary`. Consume both.

**Out of scope.**

- Do not touch CLI output formatting (Task 5) or the frontend (Task 6).
- Keep `violations`, `conflicts`, `coveredFiles`, `moduleCoverage`, `emptyModules`, `moduleEdges` logic intact.

**Acceptance criteria.**

- [ ] A fixture where feature A = `{root:x, modules:[x,y,z]}`, feature B = `{root:x1, modules:[x1,y,z1]}` with real edges `x→y,y→z,x1→y,y→z1`: `featureGraphs` for A contains edges `x→y,y→z` only; B contains `x1→y,y→z1` only; `closureViolations` is empty.
- [ ] Add a real edge `y→w` with `w` in no feature → one `unclaimed-edge` violation.
- [ ] Mark `x` (a controller importing `y` and `y2` where `y2 ∉ A`) `barrel:true` → no `closure-escape` for `x→y2`; A's graph shows `x→y` only.
- [ ] A feature whose members yield two rootless nodes → one `multi-root` violation.
- [ ] `test/closure.test.ts` covers the four cases above; `pnpm test` and `pnpm lint` pass.

**Done when.** `test/closure.test.ts` passes and `packages/depcruise-viz` `pnpm lint` succeeds.

---

## Task: CLI lint output for closure violations [AFK]

**Why.** `depcruise-viz lint` is how a developer (and Tasks 8/9's migrations) verify a config. It must report the new closure violations and single-root/coverage state and set a non-zero exit code on failure.

**What.** `lint()` prints coverage + per-feature summary to stdout and closure violations (grouped by reason) to stderr, returning `false` (non-zero exit) when any `closureViolations` or layer `violations` exist.

**Read first.**

- `packages/depcruise-viz/src/cli/run.ts` — current `lint()` (reads `summary.violations`/`breaches`; prints coverage; sets exit).
- `packages/depcruise-viz/src/cli/index.ts`, `src/cli/load-config.ts` — command wiring + config loading.
- `packages/depcruise-viz/src/types.ts` (post-Task-2) — `closureViolations` shape.

**Interface produced.**

- `lint(): Promise<boolean>` — `true` iff `summary.violations` and `summary.closureViolations` are both empty. stderr lists each violation as `<reason>: <detail>` grouped by `feature`. Exit code 1 on `false` (existing pattern).

**Inputs from predecessors.** Task `Analyze` produces `VizSummary.closureViolations: FeatureClosureViolation[]` (with `reason`/`feature`/`fromModule`/`toModule`/`detail`). Read those fields.

**Out of scope.**

- No new subcommands. Do not touch analyze/compile logic. Reuse the existing Effect `Command` structure — no restructuring.

**Acceptance criteria.**

- [ ] `pnpm lint:depcruise` on a clean config exits 0 and prints the per-feature coverage summary.
- [ ] Introducing an unclaimed edge makes it exit 1 and print the `unclaimed-edge` line to stderr.
- [ ] `pnpm lint` (tsc) passes.

**Done when.** `pnpm lint:depcruise` returns exit 0 on the (migrated, Task 8) self-config and prints closure violations with a non-zero exit when one is injected.

---

## Task: Frontend model layer — declared membership + barrel/shared [AFK]

**Why.** The frontend must source feature graphs from declared membership (the `featureGraphs` the backend now emits) instead of re-inferring `owned ∪ consumed`, and drop the visibility fields that no longer exist. This is what removes the disconnected-roots mess at the data layer.

**What.** Update the frontend model: `ModuleNode` drops `visibility`/`feature`/`sharedWith`, gains `barrel`/`isShared`. Feature graph comes from `summary.featureGraphs`. Retire visibility helpers and the owned/consumed split.

**Read first.**

- `packages/frontend/src/components/blocks/dependency-cruiser-viz/model/types.ts` — frontend copy of `VisualizationConfig`/`VizSummary` (must match backend Task-2 shapes: add `featureGraphs`, `closureViolations`; drop `breaches`/`featureModuleEdges`/`featureEdges`; drop module `visibility`/`feature`/`sharedWith`).
- `model/modules.ts` — `ModuleNode`, `allModules`, `moduleKey`, `moduleFiles`, `resolveBreachModule`.
- `model/features.ts` — `featureFocus`, `featureFiles`, `featureFileSets`.
- `model/module-graph.ts` — `featureModuleGraph`, `moduleFamily`.
- `model/visibility.ts` — `VISIBILITY_COLOR`, `fileVisibility`, `moduleVisibilityByPath`.
- `model/feature-rules.ts` — `featureRules`, `FeatureRules`, `FeatureOwnedModule`, `FeatureConsumedModule`.
- `graph/feature-layers/feature-layers-model.ts` — `buildFeatureLayersModel`, `filterChipModules`, `FilterChipId`.
- `model/index.ts` — the barrel re-exports to update.

**Interface produced.**

- `ModuleNode = { key; layer; name; barrel: boolean; isShared: boolean; fileCount; breachCount; isBreached }` (compute `isShared` = named by ≥2 features via `config.features`; `breachCount`/`isBreached` now from `closureViolations` touching the module, or drop if unused by UI — state which in the diff).
- `featureModuleGraph(config, summary, feature): FeatureModuleGraph` — returns the backend `summary.featureGraphs` entry for `feature` mapped to `{nodes: ModuleNode[], edges}` (no local inference). `moduleFamily` kept.
- `featureFocus`/`featureFileSets` — replace `owned`/`consumed` with a single declared `members: Set<string>` (+ `featureFiles` returns files of members). Update or remove `FeatureFocus` accordingly.
- `feature-rules.ts` — `FeatureRules` becomes `{ feature: {name,description?}; root: string; modules: Array<{name,layer,path,barrel}> }` (drop `ownedModules.visibility/sharedWith` and `consumes`).
- `filterChipModules` — replace `shared-unowned`/`breached`/`public-surface` filters with what survives: `shared` (isShared) and `breached` (isBreached) only; drop `public-surface`. `VISIBILITY_COLOR`/`fileVisibility`/`moduleVisibilityByPath` removed.

**Inputs from predecessors.** Task `New config model` defines the shared `VisualizationConfig`/`VizSummary`/`featureGraphs`/`closureViolations` shapes (backend copy). Mirror them verbatim into the frontend `model/types.ts`. Task `Analyze` guarantees `summary.featureGraphs[].edges` are already member-scoped and barrel-filtered, so the frontend consumes them directly.

**Out of scope.**

- Do not edit `.tsx` panels/nodes (Task 7 owns rendering). This task changes model/data only; panels may not compile until Task 7 — that is expected and acceptable for this task's own `tsc` scope is limited to `model/*` (note in the diff which panel breakages Task 7 will fix).
- Do not touch the layer-grid `buildLayerGrid` beyond removing dead visibility reads.

**Acceptance criteria.**

- [ ] `model/types.ts` matches the backend `VizSummary` (has `featureGraphs`, `closureViolations`; no `breaches`/`visibility`).
- [ ] `featureModuleGraph` returns the `summary.featureGraphs` entry for the feature with no local `featureFocus` inference.
- [ ] No `git grep` hits for `visibility`/`sharedWith`/`VISIBILITY_COLOR`/`owned`/`consumed` in `model/*.ts` (except `isBreached`).
- [ ] `model/*.ts` typecheck against the new shapes (verified via Task 7's `pnpm lint`, or a standalone `tsc` on the model dir).

**Done when.** `model/*.ts` compiles against the new shared shapes and `featureModuleGraph` sources nodes/edges from `summary.featureGraphs`.

---

## Task: Frontend UI — isolate cone, encode barrel + shared [AFK]

**Why.** This is the payoff the user asked for: selecting a feature shows a clean single-root cone; nodes visibly mark the two facts that aren't obvious (shared, barrel); the owned/consumed dashed styling (now meaningless) is retired. Same visualization level as today, just fed clean data.

**What.** Update the feature-layers panels and node renderers to: render only the selected feature's `featureGraphs` cone (isolate, not dim); encode `isShared` (badge/tint) and `barrel` (distinct shape/icon) on nodes; remove owned/consumed styling; keep swimlanes/barycenter/family-clustering/cycle-breach edges via the untouched `computeFeatureGraphLayout`.

**Read first.**

- `graph/feature-layers/feature-graph-layout.ts` — `computeFeatureGraphLayout`, `ModuleGraphNodeData`, `ColumnMode` (**reused; only `ModuleGraphNodeData.isOwned` is replaced with `barrel`/`isShared` passthrough**).
- `graph/feature-layers/feature-graph-panel.tsx` — `ModuleGraphNode` (reads `isOwned`/`isConsumed`/`m.visibility`/`m.breachCount`), `GraphFocus`.
- `graph/feature-layers/feature-layers-panel.tsx` — `ownedModules`/`consumedModules`/`highlightedModules` derivation, `ModuleInteraction`, chip bar, group-band removal already done in Task 1.
- `graph/feature-layers/module-chips.tsx` — `HighlightState` (owned/consumed), `LeafRow` styling, `VISIBILITY_COLOR` dot.
- `graph/feature-layers/feature-rules-dialog.tsx` — renders `FeatureRules` (now `{root, modules}`).
- `graph/layer/layer-node-types.tsx` — `LayerNodeData` (`isShared`/`isEntry` already exist; align with the new `isShared` meaning if it reads module data).
- `dependency-cruiser-viz.fixture.tsx` — the react-cosmos fixture used to eyeball the result (`pnpm dev`).

**Interface produced.**

- `ModuleGraphNodeData = { module: ModuleNode; isShared: boolean; barrel: boolean }` (replaces `isOwned`). `computeFeatureGraphLayout(graph, layerOrder, columnMode)` — drop the `ownedKeys` parameter; node data reads `module.isShared`/`module.barrel`.
- `ModuleGraphNode` renders: plain node default; shared → subtle badge/tint; barrel → distinct shape/icon; breach/cycle edges unchanged.
- `feature-layers-panel.tsx`: selecting a feature renders only that feature's cone (members from `featureModuleGraph`); no owned/consumed highlight state.
- `module-chips.tsx` `HighlightState` loses `ownedModules`/`consumedModules`; chip filters = `shared`/`breached`.

**Inputs from predecessors.** Task `Frontend model` produces `ModuleNode` with `barrel`/`isShared` (no `visibility`), `featureModuleGraph` sourced from `summary.featureGraphs`, `FeatureRules = {feature, root, modules}`, and `filterChipModules` = shared/breached. Quote those shapes.

**Out of scope.**

- Do not rewrite the layout algorithm in `feature-graph-layout.ts` (only swap the node-data field). Do not touch `model/*.ts` (Task 6 owns it).
- Do not re-add dimming as a substitute for isolation.

**Acceptance criteria.**

- [ ] Selecting a feature in the fixture shows only its member nodes as a single-root left→right cone (verified visually via `pnpm dev`).
- [ ] Shared and barrel nodes are visually distinguishable; no dashed "consumed" styling remains.
- [ ] `git grep -n "isOwned\|isConsumed\|VISIBILITY_COLOR" graph/feature-layers` returns nothing.
- [ ] `cd packages/frontend && pnpm lint` passes.

**Done when.** `packages/frontend` `pnpm lint` passes and the cosmos fixture renders one clean single-root cone per selected feature with shared/barrel encoding.

---

## Task: Migrate depcruise-viz self-config + skills + README [HITL]

**Why.** The package must dogfood its own new model, and the two skills + README that teach the model are now wrong. A human should review the feature-tree modeling judgment and the rewritten guidance prose.

**What.** Re-author `packages/depcruise-viz/depcruise.config.ts` into `feature(name,{root,modules})` trees (its three features `authoring`/`compile`/`analyze` over the `cli/core/types` layers), and rewrite `skills/author-architecture-config/SKILL.md` + `skills/enforce-boundaries/SKILL.md` + `README.md` to the new model (no visibility; root+members; barrel; closure lint).

**Read first.**

- `packages/depcruise-viz/depcruise.config.ts` — current self-config (3 modules, visibility:'public').
- `packages/depcruise-viz/skills/author-architecture-config/SKILL.md` — current visibility/sharedWith guidance to rewrite.
- `packages/depcruise-viz/skills/enforce-boundaries/SKILL.md` — current breach-derivation workflow.
- `packages/depcruise-viz/README.md`, `CONTEXT.md`, `docs/adr/0001-...md` — the settled model to teach.

**Interface produced.** Internal-only (config + docs). No code interface.

**Inputs from predecessors.** Task `CLI lint` provides `pnpm lint:depcruise` to verify the migrated config passes with zero closure violations. Tasks 2–4 provide the working `module`/`feature`/analyze runtime.

**Out of scope.**

- Do not change source code. Do not migrate the booking-service config (Task 9).

**Acceptance criteria.**

- [ ] `cd packages/depcruise-viz && pnpm lint:depcruise` exits 0 on the migrated self-config.
- [ ] `SKILL.md` files and `README.md` contain no `visibility`/`sharedWith`/`private`/`public` guidance; they describe `root`/`modules`/`barrel`/closure.
- [ ] `pnpm lint` passes.

**Done when.** `pnpm lint:depcruise` is clean on the migrated self-config and a human approves the rewritten skills/README. **HITL** — modeling + prose need review.

---

## Task: Migrate booking-service depcruise.config.ts [HITL]

**Why.** The booking service is the real-world stress test that motivated the redesign (its inferred graph is the messy screenshot). Re-authoring it proves the new model produces one clean single-root cone per endpoint and that closure lint holds on a large config.

**What.** Rewrite `/Users/kishorepolamarasetty/CAREER/NUMA/numa-product/src/services/booking-service/depcruise.config.ts` from the current 7-feature + `sharedWith` graph into `feature(name,{root,modules})` trees with `barrel` flags. Keep the six layer bands (`handlers → orchestrators → services → domain → clients → infrastructure`) and the exact `ignore` list.

**Read first.**

- `/Users/kishorepolamarasetty/CAREER/NUMA/numa-product/src/services/booking-service/depcruise.config.ts` — current config: 7 features (`offers:reservation|city|property|unit-group`, `cart:preview|create|process`), layer bands, `ignore` list, and the full `sharedWith` module graph (source of truth for who reaches what).
- `packages/depcruise-viz/CONTEXT.md` + ADR `0001` — the target model.
- `packages/depcruise-viz/skills/author-architecture-config/SKILL.md` (post-Task-8) — the new authoring guidance.

**Interface produced.** Internal-only (one config file). No code interface.

**Modeling guide (from the current config's `sharedWith` graph).**

- **Features (roots):** each endpoint keeps its own root controller — `offers/city-offers.controller.ts`, `property-offers.controller.ts`, `unit-group-offers.controller.ts`, `offers/offers.controller.ts` (reservation); cart operations root at `cart/cart.controller.ts` split per operation (`preview`/`create`/`process` orchestrators).
- **Barrels:** the shared entry controllers/DI modules that fan out to all endpoints — `src/handlers/offers` (NestJS module registering all four), `src/handlers/offers/offers.controller.ts`, `src/handlers/cart`, `src/orchestrators/cart` (DI barrel) — flag `barrel: true`.
- **Shared modules** (named by multiple feature trees, emergent): `orchestrators/offers/reservation` (all four offers + `cart:create`), `orchestrators/cart/multi-reservation` (all cart ops), `domain/cart`, `domain/order-item`, `services/order-items`, `services/profile`, `clients/discount-engine`, and the cross-cutting leaves `otel`/`utils`/`config.ts`/`constants.ts` (all endpoints).
- **Cross-cutting leaves** live in the `infrastructure` layer; every feature that reaches them lists them as members (that is the emergent sharing — no marker).

**Inputs from predecessors.** Task `CLI lint` provides `pnpm lint:depcruise` (run against the booking-service directory) to verify zero closure violations. Task `Analyze` guarantees the per-feature `featureGraphs`. This task can run parallel with Task 8 (different files).

**Out of scope.**

- Do not change booking-service source code or its `ignore` list contents.
- Do not touch depcruise-viz source or its self-config (Task 8).

**Acceptance criteria.**

- [ ] Running the migrated config through `depcruise-viz lint` exits 0 (zero closure violations, single root per feature).
- [ ] All 7 features declare a single `root` and a `modules` list; barrels flagged; no `visibility`/`sharedWith` remain.
- [ ] Loading it in the viz shows one clean single-root cone per feature (spot-check via the frontend fixture or devtools report).

**Done when.** `depcruise-viz lint` is clean on the migrated booking-service config and a human confirms each endpoint renders as a single-root cone. **HITL** — feature modeling needs judgment + review.

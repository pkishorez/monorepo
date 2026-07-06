# depcruise-viz — Skill Spec

depcruise-viz lets you author a project's layered architecture as a typed `depcruise.config.ts` — a **layer graph** (a DAG of layers, wired with `edge(a, b)` = "a may import b") plus declared **modules** (with optional `opaque` and `rules`) — then compiles it into [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) rules to enforce layer ordering and module rules. The same compiled model also emits a visualization config for rendering the dependency graph. It is framework-agnostic and Node/ESM-only.

## Domains

| Domain                           | Description                                                                | Skills                     |
| -------------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| Authoring the architecture model | Declaring layers, the layer graph (edges/siblings), and modules in the DSL | author-architecture-config |
| Enforcing boundaries             | Running deps / files / lint, reading output, wiring lint into CI           | enforce-boundaries         |
| Programmatic integration         | Embedding the cruise/analyze surface in tooling                            | programmatic-analysis      |

## Skill Inventory

| Skill                      | Type      | Domain                   | What it covers                                                      | Failure modes |
| -------------------------- | --------- | ------------------------ | ------------------------------------------------------------------- | ------------- |
| author-architecture-config | core      | authoring-model          | layer / layerGraph / edge / module, opaque, rules, granularity      | 5             |
| enforce-boundaries         | lifecycle | enforcement              | deps / files / lint, CI wiring, exit codes, three violation classes | 5             |
| programmatic-analysis      | core      | programmatic-integration | cruiseProject / analyzeDeps / analyzeFiles (`/node`), pure helpers  | 4             |

## Failure Mode Inventory

### author-architecture-config (5 failure modes)

| #   | Mistake                                         | Priority | Source                         | Cross-skill? |
| --- | ----------------------------------------------- | -------- | ------------------------------ | ------------ |
| 1   | Retired functions/options (layersTopDown, etc.) | HIGH     | authoring/index.ts; types.ts   | —            |
| 2   | Reusing a layer name                            | HIGH     | authoring/layer.ts; CONTEXT.md | —            |
| 3   | Self-edge or redundant skip edge                | MEDIUM   | authoring/layer-graph.ts       | —            |
| 4   | Module-rule contradiction                       | MEDIUM   | authoring/module.ts            | —            |
| 5   | Coarse module that mixes concerns               | MEDIUM   | maintainer interview           | —            |

### enforce-boundaries (5 failure modes)

| #   | Mistake                             | Priority | Source                        | Cross-skill? |
| --- | ----------------------------------- | -------- | ----------------------------- | ------------ |
| 1   | Treating uncovered files as fine    | HIGH     | cli/run.ts; interview; README | —            |
| 2   | Confusing the three violation types | HIGH     | cli/run.ts; types.ts          | —            |
| 3   | Overlapping layer path patterns     | MEDIUM   | cli/run.ts; types.ts; README  | —            |
| 4   | Layer-ordering cycle across graphs  | MEDIUM   | validate-layer-ordering.ts    | —            |
| 5   | Using glob patterns in ignore       | MEDIUM   | cli/load-config.ts; README    | —            |

### programmatic-analysis (4 failure modes)

| #   | Mistake                                  | Priority | Source                  | Cross-skill?                                   |
| --- | ---------------------------------------- | -------- | ----------------------- | ---------------------------------------------- |
| 1   | Importing cruise/analyze fns from root   | HIGH     | index.ts; node.ts       | —                                              |
| 2   | Reading summary.breaches / group helpers | HIGH     | types.ts; index.ts      | —                                              |
| 3   | cruiseProject pointed at wrong dir       | MEDIUM   | cruise/index.ts; README | —                                              |
| 4   | Generating against wrong version surface | HIGH     | interview; package.json | author-architecture-config, enforce-boundaries |

## Tensions

| Tension                                        | Skills                                             | Agent implication                                                         |
| ---------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Granularity vs maintenance overhead            | author-architecture-config ↔ enforce-boundaries    | Over-coarsens (weak enforcement) or over-nests (noisy config)             |
| Zero-uncovered goal vs incremental adoption    | author-architecture-config ↔ enforce-boundaries    | Calls lint "passing" with files unmodeled, or stalls modeling all at once |
| Internal programmatic surface vs version drift | programmatic-analysis ↔ author-architecture-config | Generates against exports/options absent in installed version             |

## Cross-References

| From                       | To                         | Reason                                                         |
| -------------------------- | -------------------------- | -------------------------------------------------------------- |
| author-architecture-config | enforce-boundaries         | After authoring, run lint to verify boundaries and coverage    |
| enforce-boundaries         | author-architecture-config | Every violation maps back to a layer-graph or module decision  |
| programmatic-analysis      | author-architecture-config | The programmatic surface consumes the same ProjectConfig model |

## Subsystems & Reference Candidates

| Skill                      | Subsystems | Reference candidates                        |
| -------------------------- | ---------- | ------------------------------------------- |
| author-architecture-config | —          | DSL function signatures + ModuleRules table |
| enforce-boundaries         | —          | deps / files / lint output legend           |
| programmatic-analysis      | —          | Root vs /node export map                    |

## Remaining Gaps

All gaps resolved in the interview.

## Recommended Skill File Structure

- **Core skills:** author-architecture-config, programmatic-analysis
- **Framework skills:** none (framework-agnostic)
- **Lifecycle skills:** enforce-boundaries (run-and-enforce journey)
- **Composition skills:** none — dependencies are bundled; no peer deps
- **Reference files:** optional `references/dsl-api.md` for author-architecture-config (signatures + ModuleRules); optional `references/exports.md` for programmatic-analysis (root vs /node)

## Composition Opportunities

| Library            | Integration points                          | Composition skill needed? |
| ------------------ | ------------------------------------------- | ------------------------- |
| dependency-cruiser | Compiled to its rule set; underlying engine | no (bundled dependency)   |

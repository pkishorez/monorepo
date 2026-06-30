# depcruise-viz — Skill Spec

depcruise-viz lets you author a project's layered architecture as a typed `depcruise.config.ts`, then compiles it into [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) rules to enforce layer ordering and module-visibility boundaries. The same compiled model also emits a visualization config for rendering the dependency graph. It is framework-agnostic and Node/ESM-only.

## Domains

| Domain                           | Description                                                                         | Skills                     |
| -------------------------------- | ----------------------------------------------------------------------------------- | -------------------------- |
| Authoring the architecture model | Declaring stacks, groups, layers, features, and module visibility in the config DSL | author-architecture-config |
| Enforcing boundaries             | Running the analysis, reading output, wiring lint into CI                           | enforce-boundaries         |
| Programmatic integration         | Embedding the compile/cruise/analyze surface in tooling                             | programmatic-analysis      |

## Skill Inventory

| Skill                      | Type      | Domain                   | What it covers                                                       | Failure modes |
| -------------------------- | --------- | ------------------------ | -------------------------------------------------------------------- | ------------- |
| author-architecture-config | core      | authoring-model          | layer/layersTopDown/group/feature/module, visibility, granularity    | 5             |
| enforce-boundaries         | lifecycle | enforcement              | lint command, CI wiring, exit codes, violations/breaches/coverage    | 4             |
| programmatic-analysis      | core      | programmatic-integration | cruiseProject (`/node`), pure compile/analyze helpers, result shapes | 3             |

## Failure Mode Inventory

### author-architecture-config (5 failure modes)

| #   | Mistake                                  | Priority | Source                       | Cross-skill? |
| --- | ---------------------------------------- | -------- | ---------------------------- | ------------ |
| 1   | Stack built with fewer than two layers   | HIGH     | layers-top-down.ts; README   | —            |
| 2   | Reusing a layer name within same group   | HIGH     | types.ts; README; CONTEXT.md | —            |
| 3   | sharedWith with a non-shared visibility  | MEDIUM   | module.ts                    | —            |
| 4   | Feature modeled as a folder, not journey | HIGH     | maintainer interview         | —            |
| 5   | Coarse module that mixes concerns        | MEDIUM   | maintainer interview         | —            |

### enforce-boundaries (4 failure modes)

| #   | Mistake                            | Priority | Source                        | Cross-skill? |
| --- | ---------------------------------- | -------- | ----------------------------- | ------------ |
| 1   | Treating uncovered files as fine   | HIGH     | cli/run.ts; interview; README | —            |
| 2   | Overlapping layer path patterns    | MEDIUM   | cli/run.ts; types.ts; README  | —            |
| 3   | Layer-ordering cycle across stacks | MEDIUM   | validate-layer-ordering.ts    | —            |
| 4   | Confusing violations with breaches | MEDIUM   | cli/run.ts; types.ts          | —            |

### programmatic-analysis (3 failure modes)

| #   | Mistake                                  | Priority | Source                  | Cross-skill?                                   |
| --- | ---------------------------------------- | -------- | ----------------------- | ---------------------------------------------- |
| 1   | Importing cruiseProject from root        | HIGH     | index.ts; node.ts       | —                                              |
| 2   | cruiseProject pointed at wrong dir       | MEDIUM   | cruise/index.ts; README | —                                              |
| 3   | Generating against wrong version surface | HIGH     | interview; package.json | author-architecture-config, enforce-boundaries |

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
| enforce-boundaries         | author-architecture-config | Every violation/breach maps back to a config decision          |
| programmatic-analysis      | author-architecture-config | The programmatic surface consumes the same ProjectConfig model |

## Subsystems & Reference Candidates

| Skill                      | Subsystems | Reference candidates                                  |
| -------------------------- | ---------- | ----------------------------------------------------- |
| author-architecture-config | —          | DSL function signatures + visibility resolution table |
| enforce-boundaries         | —          | —                                                     |
| programmatic-analysis      | —          | Root vs /node export map                              |

## Remaining Gaps

All gaps resolved in the interview.

## Recommended Skill File Structure

- **Core skills:** author-architecture-config, programmatic-analysis
- **Framework skills:** none (framework-agnostic)
- **Lifecycle skills:** enforce-boundaries (run-and-enforce journey)
- **Composition skills:** none — dependencies are bundled; no peer deps
- **Reference files:** optional `references/dsl-api.md` for author-architecture-config (signatures + visibility rules); optional `references/exports.md` for programmatic-analysis (root vs /node)

## Composition Opportunities

| Library            | Integration points                          | Composition skill needed? |
| ------------------ | ------------------------------------------- | ------------------------- |
| dependency-cruiser | Compiled to its rule set; underlying engine | no (bundled dependency)   |

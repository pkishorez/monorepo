# laymos

## Unreleased

### Changed

- Stories and Tests are owned by folder Modules through flat `laymos/`
  surfaces. Their `.story.ts` and `.test.ts` suffixes distinguish the two
  executable concepts.
- `laymos tests` executes named primitive input-and-expectation cases and
  returns a presentation-neutral expected-versus-actual report.
- Tests and their Test Cases carry required human-facing names and descriptions
  for report and DevTools presentation.
- Test Cases declare positive or negative intent so expected rejection and
  failure paths are explicit in reports and DevTools.
- Ejection rewrites production code atomically and leaves every `laymos/`
  surface untouched.
- The optional Project Narrative is one named Markdown document that remains
  separate from executable Stories.
- Story coverage is reported per Story as narrated, omitted, and unnarrated
  percentages, with no Module, Layer, or Project rollup.

## 0.0.1

### Patch Changes

- [`6d15b71`](https://github.com/pkishorez/monorepo/commit/6d15b71455a81ce4bd542f6d288eb9dfa4d04d71) Thanks [@pkishorez](https://github.com/pkishorez)! - First public release. Layers. Modules. Stories. Declare your architecture once; get enforcement and the diagram for free.

  - `laymos` CLI: `lint` enforces the declared layer/module graph, `stories` runs executable architecture stories.
  - `laymos/story` runtime: `story`, `storyGroup`, `step`, `decision`, `functionBlock` for instrumenting code with story recording. This subpath only depends on `effect` and is safe outside Node.
  - `effect` is a peer dependency, so story recording always runs on the consumer's effect instance.

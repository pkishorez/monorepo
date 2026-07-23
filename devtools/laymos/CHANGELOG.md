# laymos

## Unreleased

### Changed

- Stories are owned by folder Modules through flat `stories/` surfaces.
  Discovery and execution use suffixless Story paths, Module execution replaces
  Group execution, and ejection removes every complete Story surface.
- The optional Project Narrative combines Markdown with typed Project Map
  references to Layer Graphs, Layers, and Modules without becoming an
  executable Story.
- Story coverage is reported per Story as narrated, omitted, and unnarrated
  percentages, with no Module, Layer, or Project rollup.

## 0.0.1

### Patch Changes

- [`6d15b71`](https://github.com/pkishorez/monorepo/commit/6d15b71455a81ce4bd542f6d288eb9dfa4d04d71) Thanks [@pkishorez](https://github.com/pkishorez)! - First public release. Layers. Modules. Stories. Declare your architecture once; get enforcement and the diagram for free.

  - `laymos` CLI: `lint` enforces the declared layer/module graph, `stories` runs executable architecture stories.
  - `laymos/story` runtime: `story`, `storyGroup`, `step`, `decision`, `functionBlock` for instrumenting code with story recording. This subpath only depends on `effect` and is safe outside Node.
  - `effect` is a peer dependency, so story recording always runs on the consumer's effect instance.

# laymos

## 0.0.14

### Patch Changes

- Updated dependencies []:
  - @kestack/effect-tracer@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies []:
  - @kestack/effect-tracer@0.0.13

## 0.0.12

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: a new config format. A Project is one tree: a folder with an `index.ts` is a Module, any other folder a Wrapper, and the config is `sourceRoots`, `ignoredPaths`, `fileModules`, `rules` and `exceptions`. Layers, LayerGraphs, Module Graphs, `shared`, `exposed`, `docsPath`, `lint layers`, `lint modules` and `inspect layer` are gone, and an old config is rejected. `laymos lint` names both files of each Violation and the key that would allow it.

  Breaking: Stories are rebuilt. A Story is a folder with a `story.md` that links its sub-Stories, and each claim is a Proof (`*.proof.ts`, `Proof.make` or `Proof.browser`), run in the process or in real Chromium with a recording. Question-based Stories are removed. `laymos stories` exits when it is done, even when a Proof leaves a timer or a socket open, and Proofs load in a project without `"type": "module"`. An `ignoredPaths` entry that does not exist is now reported. Needs Effect `^4.0.0`; `vite` (`^8.0.0`) and `playwright-core` (`^1.63.0`, for browser Proofs) are optional peers.

- Updated dependencies [[`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9)]:
  - @kestack/effect-tracer@0.0.12

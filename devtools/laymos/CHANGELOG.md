# laymos

## 0.0.1

### Patch Changes

- [`6d15b71`](https://github.com/pkishorez/monorepo/commit/6d15b71455a81ce4bd542f6d288eb9dfa4d04d71) Thanks [@pkishorez](https://github.com/pkishorez)! - First public release of Laymos, and executable architecture Stories for the DynamoDB toolkit.

  **laymos** — Layers. Modules. Stories. Declare your architecture once; get enforcement and the diagram for free.

  - `laymos` CLI: `lint` enforces the declared layer/module graph, `stories` runs executable architecture stories.
  - `laymos/story` runtime: `story`, `storyGroup`, `step`, `decision`, `functionBlock` for instrumenting code with story recording. This subpath only depends on `effect` and is safe outside Node.
  - `effect` is a peer dependency, so story recording always runs on the consumer's effect instance.

  **std-toolkit** — DynamoDB services are now instrumented with Laymos stories (`laymos` is a new runtime dependency), and executable stories document the DynamoDB toolkit end to end.

  Cleanups in this release:

  - Removed from the public surface: `DynamoEntity`, `DynamoSingleEntity`, `SQLiteEntity`, `SQLiteSingleEntity`, and `EntityRegistry` value exports (the `EntityType` / `SingleEntityType` types remain). Use `DynamoTable` / `SQLiteTable` and the entity APIs built on them instead.
  - `./idb` subpath now resolves to the restructured `dist/db/idb/src/` layout; deep `./idb/*` import paths changed accordingly.
  - Peer ranges: `effect` loosened to `^4.0.0-beta.78`, `react` widened to `^18 || ^19`, `@tanstack/react-db` stays `>=0.1.64`.

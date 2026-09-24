# @pkishorez/devtools

## 0.0.10

### Patch Changes

- [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21) Thanks [@pkishorez](https://github.com/pkishorez)! - Add the Monoverse tool: a bird's-eye view of one pnpm monorepo. Add a monorepo, see every Package laid out by dependency rank with runtime, dev, peer, and optional connections you can filter, spot dependency cycles, and drill from any Package that carries a `laymos.config.json` into Laymos without leaving the canvas. Analysis and the `AnalyzeMonorepo` RPC live inside DevTools; the explorer UI lives in the `kui-toolkit` Monoverse block.

  Show git changes in Monoverse the same way Laymos does. Pick a Base ref from the git menu to mark new and modified Packages on the canvas and in the Package tree, or hide unchanged ones. Right-click a Package to read its README beside its files, with a diff for every changed file; a Package with a Laymos config offers Open in Laymos there, and closing Laymos returns to the dialog as it was left. Embedded Laymos compares against the same Base ref. The Laymos Files tab also lists Unanalyzed files, the files git knows beside the analyzed ones, shown muted.

  Switch between git worktrees of a project in Monoverse and Laymos. Registered projects now live in the DevTools database instead of browser storage and can be edited or removed; the selected project and worktree live in the URL. Projects previously saved in the browser need to be added once more.

  Add Client Commands. The `devtools` binary still runs the DevTools Server; the new subcommands `devtools list-traces`, `devtools get-trace`, `devtools list-flows`, and `devtools get-flow` read Traces and Flows from it as simplified JSON or readable text. `devtools skills` lists the shipped agent skills, `devtools skills devtools` prints one, and `--install <dir>` copies one or all of them into `<dir>/<name>/`. The server URL resolves from `--url`, `DEVTOOLS_URL`, or `DEVTOOLS_PORT`.

  Add adaptive compact layouts for the Lotel and Laymos workspaces, with a bottom tool bar, drill-down pages, and sheet-based controls below 768px. The DevTools UI server now listens on all interfaces and honours `DEVTOOLS_UI_PORT` so the app can be opened from a phone.

  Breaking:

  - Flows move to `@pkishorez/flow`. `DevtoolsRpc` replaces `ListFlows` and `GetFlow` with `WriteFlowEntries`, `ListFlowEntries`, and `ClearFlows`.
  - The git RPC procedures are now Tool-neutral: `GetBranches`, `GetChanges`, `GetFileDiff`, and `GetKnownFiles` take any folder and replace `GetLaymosBranches`, `GetLaymosChanges`, and `GetLaymosFileDiff`.

- Updated dependencies [[`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21), [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21), [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21), [`2503956`](https://github.com/pkishorez/monorepo/commit/2503956177145ac7d3766e6742cfa648a83ddc21)]:
  - @pkishorez/flow@0.0.10
  - laymos@0.0.10
  - @pkishorez/lotel@0.0.10
  - std-toolkit@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [[`20c7f35`](https://github.com/pkishorez/monorepo/commit/20c7f357eb10771f0fb56d6767c14f6ca63a9a4f)]:
  - std-toolkit@0.0.9
  - @pkishorez/lotel@0.0.9
  - laymos@0.0.9

## 0.0.8

### Patch Changes

- [`48fa821`](https://github.com/pkishorez/monorepo/commit/48fa8212deeb0c2de2d6a34e157852e896cda06a) Thanks [@pkishorez](https://github.com/pkishorez)! - Add project documentation and source browsing to the architecture workspace, with change-aware source views and safe documentation loading.

- [`7be110e`](https://github.com/pkishorez/monorepo/commit/7be110ee255fb50009e899c5aaf2121e9c0f3b65) Thanks [@pkishorez](https://github.com/pkishorez)! - Bundle the DevTools UI with the local server: `devtools` now serves its own home page, Lotel, and Laymos at the loopback address instead of redirecting to a hosted app. Laymos Story proofs run with a fixed log level and their own logger set, so a proof that captures its logs behaves the same in DevTools as in the CLI.
- Updated dependencies [[`48fa821`](https://github.com/pkishorez/monorepo/commit/48fa8212deeb0c2de2d6a34e157852e896cda06a), [`7be110e`](https://github.com/pkishorez/monorepo/commit/7be110ee255fb50009e899c5aaf2121e9c0f3b65), [`efb3901`](https://github.com/pkishorez/monorepo/commit/efb3901439a0359ed37108db73447a07ddc2a73d), [`06eb95d`](https://github.com/pkishorez/monorepo/commit/06eb95dad79a315549e540a1aacd268c334ee8ef), [`ac3a33c`](https://github.com/pkishorez/monorepo/commit/ac3a33c4502e098fde58c9ae64923d7ddbbeb787), [`b0730f3`](https://github.com/pkishorez/monorepo/commit/b0730f371943d2f45b144103302cc64563f25ff7)]:
  - laymos@0.0.8
  - std-toolkit@0.0.8
  - @pkishorez/lotel@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies [[`eacf385`](https://github.com/pkishorez/monorepo/commit/eacf385ccd0458933758ae6a18ff078f4d669325), [`4da25e4`](https://github.com/pkishorez/monorepo/commit/4da25e426d32fb482406c089ba7c213d1d1bba98), [`a1c077d`](https://github.com/pkishorez/monorepo/commit/a1c077dd7182632203be59f35d2e475b4df6ab65), [`6630802`](https://github.com/pkishorez/monorepo/commit/66308024a71ab6a30aa0e1f979527c8fa23f533c), [`211dbe7`](https://github.com/pkishorez/monorepo/commit/211dbe7a900199a9471120fb9e2b03c32c8c43d7), [`8215ec7`](https://github.com/pkishorez/monorepo/commit/8215ec7fea498d366f9b06d9f947db960d5bf90c), [`2cfe607`](https://github.com/pkishorez/monorepo/commit/2cfe6076fe401aec0fa5f3b8e3d9f5ed655228a7)]:
  - std-toolkit@0.0.7
  - @pkishorez/lotel@0.0.7
  - laymos@0.0.7

## 0.0.6

### Patch Changes

- [`66f7e10`](https://github.com/pkishorez/monorepo/commit/66f7e10cc241c31e3d204f237a8ba05fab1a060d) Thanks [@pkishorez](https://github.com/pkishorez)! - Release the synchronized toolchain against `effect@4.0.0-rc.110` with matching internal package versions.
- Updated dependencies [[`66f7e10`](https://github.com/pkishorez/monorepo/commit/66f7e10cc241c31e3d204f237a8ba05fab1a060d)]:
  - std-toolkit@0.0.6
  - @pkishorez/lotel@0.0.6
  - laymos@0.0.6

## 0.0.5

### Patch Changes

- Updated dependencies [[`1581578`](https://github.com/pkishorez/monorepo/commit/15815780159aabe6e2f2347d0b5215338715422c)]:
  - laymos@0.0.5
  - std-toolkit@0.0.5
  - @pkishorez/lotel@0.0.5

## 0.0.4

### Patch Changes

- [`9786df7`](https://github.com/pkishorez/monorepo/commit/9786df77466cd3ca71f256a374c74ff0fb866e52) Thanks [@pkishorez](https://github.com/pkishorez)! - Pin `@effect/platform-node-shared` as a direct exact dependency. `@effect/platform-node@4.0.0-beta.102` depends on it via a caret range, so npm consumers resolved the `4.0.0-rc.*` build, whose `effect` peer nested `effect@4.0.0-rc.*` next to the beta platform-node and crashed imports (`ERR_MODULE_NOT_FOUND` on `effect/dist/unstable/http/Multipasta/Node.js`). The direct pin keeps the whole tree on `4.0.0-beta.102`.

- Updated dependencies [[`9786df7`](https://github.com/pkishorez/monorepo/commit/9786df77466cd3ca71f256a374c74ff0fb866e52)]:
  - laymos@0.0.4
  - std-toolkit@0.0.5
  - @pkishorez/lotel@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [[`3e4f58d`](https://github.com/pkishorez/monorepo/commit/3e4f58d500e3060b5a027f2a370e6ff0de233a5e)]:
  - laymos@0.0.3
  - std-toolkit@0.0.4
  - @pkishorez/lotel@0.0.3

## 0.0.2

### Patch Changes

- [`f055c4e`](https://github.com/pkishorez/monorepo/commit/f055c4ea6ab9fe0d8f75bfba013a0febbdd4cbe4) Thanks [@pkishorez](https://github.com/pkishorez)! - This release replaces the DevTools RPC surface wholesale.

  `DevtoolsRpc` is now the tool procedures merged with lotel's `LotelRpc`, served
  from the single `@pkishorez/devtools/rpc` export.

  **Architecture tools.** `AnalyzeLaymosProject` returns typed layer and module
  analysis for a project path, `GetLaymosModuleSource` returns a module's source
  snapshot with file navigation, `GetLaymosStories` returns the story tree, and
  the streaming `RunLaymosStories` runs it — optionally scoped — reporting
  per-story progress as it goes.

  **Telemetry** comes straight from `@pkishorez/lotel/rpc`: `SaveSpans`,
  `InsertLogs`, `ListSpans`, `ListLogs`, `ListFlows`, `GetTrace`, `GetFlow`, and
  `ClearTelemetry`. The `devtools get-trace <trace-id>` subcommand is backed by
  `GetTrace`. OTLP ingest is `/v1/traces` and `/v1/logs`; metrics are no longer
  collected.

  **Failures are tagged**, so callers can tell a bad path from a bad config from a
  failed analysis: `InvalidProjectPath`, `ConfigReadError`, `ConfigParseError`,
  `ConfigSchemaError`, `ConfigValidationError`, `SourceAnalysisError`,
  `ModuleSourceNotFoundError`, `ModuleSourceReadError`, and
  `StoriesUnavailableError`.

- Updated dependencies [[`8c24af2`](https://github.com/pkishorez/monorepo/commit/8c24af227c83ab532ff0865cbff44a9b5db3d34e), [`f055c4e`](https://github.com/pkishorez/monorepo/commit/f055c4ea6ab9fe0d8f75bfba013a0febbdd4cbe4), [`f055c4e`](https://github.com/pkishorez/monorepo/commit/f055c4ea6ab9fe0d8f75bfba013a0febbdd4cbe4)]:
  - std-toolkit@0.0.3
  - laymos@0.0.2
  - @pkishorez/lotel@0.0.2

## 0.0.1

### Patch Changes

- [`4d517e2`](https://github.com/pkishorez/monorepo/commit/4d517e221e487307befdecf2066cabb7a510fb8e) Thanks [@pkishorez](https://github.com/pkishorez)! - Remove the retired depcruise-viz analyzer and RPC surface in favor of Laymos.

- Updated dependencies [[`6d15b71`](https://github.com/pkishorez/monorepo/commit/6d15b71455a81ce4bd542f6d288eb9dfa4d04d71)]:
  - laymos@0.0.1
  - std-toolkit@0.0.2
  - @pkishorez/lotel@0.0.1

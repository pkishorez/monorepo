---
'@pkishorez/devtools': patch
---

Add the Monoverse tool: a bird's-eye view of one pnpm monorepo. Add a monorepo, see every Package laid out by dependency rank with runtime, dev, peer, and optional connections you can filter, spot dependency cycles, and drill from any Package that carries a `laymos.config.json` into Laymos without leaving the canvas. Analysis and the `AnalyzeMonorepo` RPC live inside DevTools; the explorer UI lives in the `kui-toolkit` Monoverse block.

Show git changes in Monoverse the same way Laymos does. Pick a Base ref from the git menu to mark new and modified Packages on the canvas and in the Package tree, or hide unchanged ones. Right-click a Package to read its README beside its files, with a diff for every changed file; a Package with a Laymos config offers Open in Laymos there, and closing Laymos returns to the dialog as it was left. Embedded Laymos compares against the same Base ref. The Laymos Files tab also lists Unanalyzed files, the files git knows beside the analyzed ones, shown muted.

Switch between git worktrees of a project in Monoverse and Laymos. Registered projects now live in the DevTools database instead of browser storage and can be edited or removed; the selected project and worktree live in the URL. Projects previously saved in the browser need to be added once more.

Add Client Commands. The `devtools` binary still runs the DevTools Server; the new subcommands `devtools list-traces`, `devtools get-trace`, `devtools list-flows`, and `devtools get-flow` read Traces and Flows from it as simplified JSON or readable text. `devtools skills` lists the shipped agent skills, `devtools skills devtools` prints one, and `--install <dir>` copies one or all of them into `<dir>/<name>/`. The server URL resolves from `--url`, `DEVTOOLS_URL`, or `DEVTOOLS_PORT`.

Add adaptive compact layouts for the Lotel and Laymos workspaces, with a bottom tool bar, drill-down pages, and sheet-based controls below 768px. The DevTools UI server now listens on all interfaces and honours `DEVTOOLS_UI_PORT` so the app can be opened from a phone.

Breaking:

- Flows move to `@pkishorez/flow`. `DevtoolsRpc` replaces `ListFlows` and `GetFlow` with `WriteFlowEntries`, `ListFlowEntries`, and `ClearFlows`.
- The git RPC procedures are now Tool-neutral: `GetBranches`, `GetChanges`, `GetFileDiff`, and `GetKnownFiles` take any folder and replace `GetLaymosBranches`, `GetLaymosChanges`, and `GetLaymosFileDiff`.

---
'@kestack/connect': patch
'code': patch
---

Cloud Connect decides which Release of each Plugin is latest, from the Plugin's Release Log, and names the Minimum Connect (ADR 0006).

- Breaking: `Connection` is at v4: `latestVersion` is gone, and `minConnect` names the oldest `ke-connect` let run the Plugins, null when Cloud Connect names none. A v3 Connection reads with `minConnect` null. Code asks to update `ke-connect` only below it.
- Breaking: `serve` and `serveOver` from `./worker` take `minConnect` instead of `connectVersion`, and the Worker reads `MIN_CONNECT` instead of `CONNECT_VERSION`.
- `./cloud` exports `isOutdated`, `pluginPath` (`/<name>/<sha256>/rpc`), `PLUGIN_MISMATCH` (4409), `PluginMismatch` and `mismatchOf`, for calling a Plugin at the Release an App was built with.
- `src/plugins/code/releases.json` is the code Plugin's Release Log; `pnpm release:plugin code "<what changed>"` builds the Plugin and appends its hash. A deployed Stage refuses a build that is not the latest Release; `alchemy dev` names its build on a folder Shelf, as a `file:` URL.
- `minConnect` in `package.json` is the Minimum Connect, `0.0.4` for now.

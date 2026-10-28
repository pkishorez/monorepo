---
'@kestack/connect': patch
'@kestack/cli-platform': patch
---

A Connection serves each Plugin at the Release it runs, and stops when it is Outdated.

- The router serves `/<plugin>/<sha256>/rpc` while the Plugin is Running that hash. A WebSocket for another is accepted and closed at once with 4409, its reason `{"running": <hash or null>}`; any other request answers 409 with the same JSON. A Plugin run with `--plugin <name>=<file>` answers at any hash.
- The unhashed `/<plugin>/rpc` is still passed to whatever Release runs, for one release, so a Code built before Releases keeps working. It goes in the next one.
- A Connection whose `ke-connect` is below the Minimum Connect reports once, then stops, and `serve` fails with what to do: `npm i -g @kestack/connect@latest`.
- A Connection keeps the Release of each Plugin it last wanted in `wanted.json` in its data folder, and starts its Plugins at them while Cloud Connect cannot be reached. Cloud Connect's answer wins over it.
- `pnpm dev` builds the code Plugin, `pnpm build:plugin`, before `alchemy dev`, and no longer passes `--plugin code=<file>`: the Connection fetches the Release from the folder Shelf, as a deployed one does.
- `@kestack/cli-platform`: `Downloads.fetch` copies a `file:` URL into the cache and checks its hash, as it does a download; one naming no file fails with `DownloadFailed` and `missing: true`, which `ActorPlugin` reports as `<name> <hash> isn't on the shelf; run the build`.

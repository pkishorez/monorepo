# The Worker decides which Plugin is latest; Code asks for the hash it was built with

Status: accepted.

Code and the code Plugin are built from the same commit but shipped apart: Code to its host, the Plugin to the Shelf, and each Connection downloads the Plugin on its own time. Code built against one Release can meet a Connection running another. So one place decides which Release every Connection runs, and Code says which one it can talk to.

Cloud Connect's Worker decides. Its `PLUGINS` names the latest Release in the Plugin's Release Log, and every Report is answered with it, as `wanted`. A deployed Stage refuses to deploy unless the build is that Release, so what the Worker names is always on the Shelf and in git. Code is built with the hash of the Release from the same commit, and calls `<tunnel>/<plugin>/<sha256>/rpc`, from the contract's `pluginPath`. A Connection running another Release accepts the socket and closes it at once with code 4409, `PLUGIN_MISMATCH`, its reason naming the hash it runs: a browser cannot read the status of a refused WebSocket upgrade, only how the socket closed. Code then compares its own hash with the Connection's listed `wanted`: the same means the Connection is Updating to it, so Code waits and tries again; another means Code itself is not the latest, so it reloads.

Which `ke-connect` may run the Plugins is one value for all of them, the Minimum Connect, `minConnect` in `package.json`, raised by hand. A Connection below it is Outdated, as its own version says, and stops.

## Considered options

- **Each Connection runs whatever its own `ke-connect` was built with.** Rejected: a Plugin fix would wait on every computer updating `ke-connect`, and Code could not know which Release it would meet.
- **Code asks for the latest, at `<tunnel>/<plugin>/rpc`, as before.** Rejected: an old tab and a new Plugin, or a new tab and a Connection not yet updated, would talk past each other until a call failed with `VersionGap`, with nothing to tell waiting from reloading.
- **Each Release names the range of `ke-connect` it runs on.** Rejected for now: one Minimum Connect is enough while there is one Plugin, and a range per Release is a second thing to keep right on every release.
- **The latest is whatever was built.** The design this replaces. Rejected: any build, even one from an unmerged change, became what every Connection ran, and nothing in git said which file was live.

## Consequences

- Every change to the Plugin's file needs `pnpm release:plugin <name> "<what changed>"` and its `releases.json` committed, or the deploy fails. That includes a change in a package the Plugin bundles.
- The build must come out the same each time from the same code, or a Release could not be built again to deploy. A test builds it twice and compares; it does not compare two computers.
- A Release's file on the Shelf never changes, and the Log only grows. Going back to an earlier Release's code builds its hash again, which the Log refuses: a rollback needs a change of its own, and so a new hash.
- `Connection` v4 drops `latestVersion` for `minConnect`: an App asks to update `ke-connect` only below the minimum, not whenever a newer one exists.

# The Worker decides which Plugin is latest; Code asks for the hash it was built with

Status: accepted. How a Connection learns it is Outdated is replaced by [ADR 0011](0011-only-the-heartbeat-stays-compatible.md).

Code and the code Plugin are built from the same commit but shipped apart: Code to its host, the Plugin to R2, and each Connection downloads the Plugin on its own time. Code built against one Release can meet a Connection running another. So one place decides which Release every Connection runs, and Code says which one it can talk to.

Connect Cloud's Worker decides. Its `RELEASES` names the latest Release in the Plugin's Release Log, and every Report is answered with it, as `wanted`. A deployed Stage refuses to deploy unless the build is that Release, so what the Worker names is always kept as a Release File and in git. Code is built with the hash of the Release from the same commit, and calls `<tunnel>/<plugin>/<sha256>/rpc`, from the Link's `pluginPath`. A Connection running another Release accepts the socket and closes it at once with code 4409, `PLUGIN_MISMATCH`, its reason naming the hash it runs: a browser cannot read the status of a refused WebSocket upgrade, only how the socket closed. Hashes have no order, so Code then asks Connect Cloud where its own hash stands, its Release Standing, holding its Link meanwhile: `Latest` means the Connection is Updating to it, so Code dials again at once; `Older`, a Release File kept but not the one named, means Code itself is behind, so it moves to its newest build and dials no more; `Unknown` means Connect Cloud is behind, its deploy pending or failed, so Code dials again slowly, and asks again. Comparing with the Connection's listed `wanted` could not say the last: a Code newer than what Connect Cloud names read as a stale one, and waited for a build that did not exist.

Which `ke-connect` may run the Plugins is one value for all of them, the Minimum Connect, `minConnect` in `package.json`, raised by hand. A Connection below it is Outdated, as its own version says, and stops.

## Considered options

- **Each Connection runs whatever its own `ke-connect` was built with.** Rejected: a Plugin fix would wait on every computer updating `ke-connect`, and Code could not know which Release it would meet.
- **Code asks for the latest, at `<tunnel>/<plugin>/rpc`.** Rejected: an old tab and a new Plugin, or a new tab and a Connection not yet updated, would talk past each other until a call failed with `VersionGap`, with nothing to tell waiting from reloading.
- **Each Release names the range of `ke-connect` it runs on.** Rejected: one Minimum Connect is enough while there is one Plugin, and a range per Release is a second thing to keep right on every release.
- **The latest is whatever was built.** The design this replaces. Rejected: any build, even one from an unmerged change, became what every Connection ran, and nothing in git said which file was live.

## Consequences

- Every change to the Plugin's file needs `pnpm release:plugin <name> "<what changed>"` and its `releases.json` committed, or the deploy fails. That includes a change in a package the Plugin bundles.
- The build must come out the same each time from the same code, or a Release could not be built again to deploy. A test builds it twice and compares; it does not compare two computers.
- A Stage only ever keeps the Release it names, and never takes one away, so a Release File it keeps but does not name is an older Release. That needs Connect Cloud to deploy before any Code built for its new Release: the deploy chain, `.github/workflows/deploy-connect.yml`, does.
- A Release File never changes, and the Log only grows. Going back to an earlier Release's code builds its hash again, which the Log refuses: a rollback needs a change of its own, and so a new hash.
- An App asks to update `ke-connect` only below the Minimum Connect, never because a newer one exists.
- This design starts fresh: ke-connect, Connect Cloud and Code ship it together, and none of them reads what one from before it sends or stores. A Connection serves a Plugin only at `/<plugin>/<sha256>/rpc`.

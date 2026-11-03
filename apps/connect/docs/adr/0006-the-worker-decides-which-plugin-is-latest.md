# The Worker decides which Plugin is latest; Code asks for the hash it was built with

Status: accepted, amended: Code no longer guesses who is behind from its saved list; it asks Cloud Connect where its Release stands, and a Connection serves the Release before while the next one downloads.

Code and the code Plugin are built from the same commit but shipped apart: Code to its host, the Plugin to the Shelf, and each Connection downloads the Plugin on its own time. Code built against one Release can meet a Connection running another. So one place decides which Release every Connection runs, and Code says which one it can talk to.

Cloud Connect's Worker decides. Its `PLUGINS` names the latest Release in the Plugin's Release Log, and every Report is answered with it, as `wanted`. A deployed Stage refuses to deploy unless the build is that Release, so what the Worker names is always on the Shelf and in git. Code is built with the hash of the Release from the same commit, and calls `<tunnel>/<plugin>/<sha256>/rpc`, from the contract's `pluginPath`. A Connection serving another Release accepts the socket and closes it at once with code 4409, `PLUGIN_MISMATCH`, its reason naming the hash it serves, null while it serves none: a browser cannot read the status of a refused WebSocket upgrade, only how the socket closed. While the next Release downloads, the one before is still served, and only once its process is gone is a socket for it refused.

Code then holds that Link and asks Cloud Connect afresh where its own hash stands, its Release Standing, through the `Standing` call, signed in as for listing Connections. The Worker answers from what it names and from its Shelf: a Stage only ever puts its latest Release on the Shelf and never takes one off, and a front end is deployed only after Connect has deployed its Release, so a file on the Shelf that the Worker does not name is an older Release. Any other is one it has never heard of. `Latest` means the Connection is Updating to it, so Code relinks. `Older` means Code itself is behind, so it moves to its newest build and never relinks that Connection again until a reload. `Unknown` means Cloud Connect has never heard of it: its deploy is pending or failed, so Code relinks every half a minute and asks again. Cloud Connect out of reach decides nothing.

## Amended

At first Code compared its hash with the `wanted` hash in its saved Connection List. Hashes have no order, so that could only tell "the same" from "another", and the list could be old. When Code was newer than Cloud Connect, between its deploy and Cloud Connect's, it called itself Stale and reloaded, into the same build. And the router served only a Plugin State of `Running`, so a Connection refused the Release it still served as soon as it said it was downloading the next. Only Cloud Connect knows which Releases it has put on its Shelf, so it is the one asked, each time, and the router tracks which Release is served apart from the Plugin State it reports.

Which `ke-connect` may run the Plugins is one value for all of them, the Minimum Connect, `minConnect` in `package.json`, raised by hand. A Connection below it is Outdated, as its own version says, and stops.

## Considered options

- **Each Connection runs whatever its own `ke-connect` was built with.** Rejected: a Plugin fix would wait on every computer updating `ke-connect`, and Code could not know which Release it would meet.
- **Code asks for the latest, at `<tunnel>/<plugin>/rpc`.** Rejected: an old tab and a new Plugin, or a new tab and a Connection not yet updated, would talk past each other until a call failed with `VersionGap`, with nothing to tell waiting from reloading.
- **Each Release names the range of `ke-connect` it runs on.** Rejected: one Minimum Connect is enough while there is one Plugin, and a range per Release is a second thing to keep right on every release.
- **The latest is whatever was built.** The design this replaces. Rejected: any build, even one from an unmerged change, became what every Connection ran, and nothing in git said which file was live.
- **Code decides from its saved list, comparing hashes.** The first form of this design. Replaced: hashes have no order, so a newer Code took itself for an older one, and an old list said what was latest before the last deploy.
- **The Worker is handed every hash in the Release Log.** Rejected: the Log grows by a couple of Releases a day, and a Worker's variable holds 5 KB, about 75 hashes. The Shelf already holds every Release the Stage deployed, and only those.
- **The Plugin State says which Release is served.** Rejected: the Heartbeat would change shape for every `ke-connect` and App already out there, and a Downloading State would have to carry a second hash. The served Release is told to the router apart.

## Consequences

- Every change to the Plugin's file needs `pnpm release:plugin <name> "<what changed>"` and its `releases.json` committed, or the deploy fails. That includes a change in a package the Plugin bundles.
- The build must come out the same each time from the same code, or a Release could not be built again to deploy. A test builds it twice and compares; it does not compare two computers.
- A Release's file on the Shelf never changes, and the Log only grows. Going back to an earlier Release's code builds its hash again, which the Log refuses: a rollback needs a change of its own, and so a new hash.
- An App asks to update `ke-connect` only below the Minimum Connect, never because a newer one exists.
- A Cloud Connect without the `Standing` call answers Code with `VersionGap`, which Code takes as `Unknown`: Cloud Connect is behind. A `ke-connect` already out there reads the Report's answer as before; nothing it reads changed.
- Each 4409 costs one call to Cloud Connect, so a Connection Updating is asked about once per relink, up to every few seconds, until it serves the new Release.
- This design starts fresh: ke-connect, Cloud Connect and Code ship it together, and none of them reads what one from before it sends or stores. A Connection serves a Plugin only at `/<plugin>/<sha256>/rpc`.

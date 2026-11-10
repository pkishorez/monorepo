# Only the Heartbeat stays compatible; the Minimum Connect covers the rest

Status: accepted. Replaces how [ADR 0006](0006-the-worker-decides-which-plugin-is-latest.md) tells a Connection it is Outdated.

Connect Cloud, the Code App and every Plugin update themselves: Connect Cloud when it deploys, the App when it reloads, a Plugin within a Heartbeat of its new Release. `ke-connect` is the one part a person updates, so it is the one part that can be older than the rest. Under ADR 0006 the Minimum Connect came inside the answer to a Report. When that answer changed shape, an older `ke-connect` could not read it. It took every Report as unsent, never learnt it was Outdated, and ran on in silence at the Release it last ran.

So the Heartbeat is the one API that must stay compatible, and a `ke-connect` too old for the rest is told so in a way it can always read.

- Every Heartbeat call, at `/heartbeat`, carries the caller's version in the `ke-connect-version` header. Signing in at `/auth` and downloading a Release File do not.
- Connect Cloud reads that header before it reads the call or checks its Sign-in. Below the Minimum Connect, it answers `426 Upgrade Required` with one line of plain text to show. That answer never changes.
- A missing header counts as below the Minimum Connect. So every `ke-connect` from before this one is refused as soon as there is a Minimum Connect, even before it is raised.
- Otherwise it answers the Report as before: the Release of each Plugin to run. The answer no longer carries the Minimum Connect.
- Only `ke-connect` calls `/heartbeat`, never a browser. A request there that names an `Origin` is refused `403`, so no page can call it with its User's cookie.
- What an older `ke-connect` reads or serves changes only together with a raised Minimum Connect, in the same change: the answer to a Report, how it runs a Plugin, and the path, key and close codes an App reaches a Plugin by. Connect Cloud reads at any older version what `ke-connect` only sends, so the Report itself may change freely.
- A `ke-connect` answered 426 prints the line and exits 75. Run as a service, it starts again at the newest version. Run by hand, it stops.

The Heartbeat still carries the Connection Status, every step of it: cloudflared Downloading, the tunnel Opening or Failed, then Ready at its address. The Connection list tells each Connection's version beside the Minimum Connect, so an App shows an Outdated Connection as one, from what an older `ke-connect` last reported. An App asks for the list at the pace of the Connection that needs it most:

| The Connection                                                               | The App asks again |
| ---------------------------------------------------------------------------- | ------------------ |
| On its way: SettingUp, Ready but not linked yet, or Outdated and seen lately | every 3 seconds    |
| Stuck or gone: Failed, Unreachable, or not seen for three Heartbeats         | every 10 seconds   |
| Linked                                                                       | not at all         |

A 4401 and a page back from hidden still ask at once. A link that drops starts the asking again, at its pace.

## Considered options

- **The Minimum Connect in the answer to a Report.** The design this replaces. Rejected for the reasons above.
- **Only add to what `ke-connect` reads.** Rejected: every value is an ESchema, and an older side cannot read a newer version at all, so a field added is a change it cannot read. And a rule that nothing checks is broken by the first change that forgets it.
- **Each Release names the `ke-connect` it needs, and an older `ke-connect` is given an older Release.** Rejected: an App calls a Plugin only at the Release it was built with (ADR 0006), so it would have to speak every Release still running somewhere. An older `ke-connect` is updated instead.
- **A frozen RPC error instead of an HTTP status.** Rejected: the one answer that never changes would then hang on the RPC library's framing, which an Effect upgrade can change.
- **Ask once at start, as a handshake.** Rejected: a Connection runs for days, and the Minimum Connect can rise while it runs. Every Heartbeat asks.

## Consequences

- The `ke-connect` released with this is the last to be installed again by hand without being told: one before it cannot read 426.
- `src/heartbeat` holds everything `ke-connect` and Connect Cloud say to each other, and only `src/cloud` and `src/connection/cli` import it, by Laymos Rule.
- `src/heartbeat/tests/frozen.test.ts` keeps `frozen.json`: the Minimum Connect, and every value `ke-connect` reads or serves, each by its version and its shape. A change to one without a raised Minimum Connect fails it. Once `minConnect` is raised, `UPDATE_FROZEN=1 pnpm test` rewrites `frozen.json`.
- What only Connect Cloud and an App say to each other, and what only an App and a Plugin say, change freely: each side updates itself.
- Raising the Minimum Connect stops every older Connection at its next Heartbeat. Under a service that is a restart; by hand, an install.
- `minConnect` in `package.json` cannot be above its `version`: the deploy refuses it. So the Minimum Connect for this release, 0.0.7, is raised in the release PR, once the version is 0.0.7. Until then a Minimum Connect of 0.0.4 already refuses every older `ke-connect`, which sends no header.
- An App does not dial an Outdated Connection. It says to update `ke-connect` on that computer.
- Running `ke-connect` as a service that updates itself, under systemd and launchd, is work of its own, after this.

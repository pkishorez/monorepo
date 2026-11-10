---
'@kestack/connect': patch
'@kestack/cli-platform': patch
---

Connect is one simple tree, tied to the User's login, and a Connection Key rotates. Only the Heartbeat between `ke-connect` and Connect Cloud stays compatible from now on; a `ke-connect` too old for the rest is told to update. This is a clean break: deploy Connect Cloud first, then install `ke-connect` again. The release PR raises the Minimum Connect to this release, once its version is bumped: `minConnect` cannot be above the package's version.

**Breaking**

- A Connection runs only while its User is signed in. Once Connect Cloud says the Sign-in is gone, the Connection, its tunnel and its Plugins stop until a new Sign-in. An outage changes nothing.
- A Connection Key rotates: a new one at each start and every hour, kept only in memory. A socket already open stays open. A new socket offering any other key closes with 4401, and a plain request gets 401. An App told 4401 asks Connect Cloud for the list, and reconnects with the key as listed.
- `ConnectionStatus` is v2, the Tunnel's own State: `SettingUp` with a `step` of `Downloading { elapsed, received }`, `Opening` or `Failed { at, problem }`, or `Ready` with a `url` and a `check` of `Unchecked`, `Reachable { at }` or `Unreachable { at, problem }`. A v1 status still reads. An older Worker cannot read a v2 status, so its Reports go unsent and Plugins wait: deploy Connect Cloud first.
- The Plugin list comes only from Connect Cloud. `wanted.json` is gone. If Connect Cloud is down at start, Plugins wait for it to answer, though sign-in can still use the kept `auth.json`. The answer is the whole list: a Plugin no longer named stops within a Heartbeat, and a deploy that names none stops every Plugin. A Report that fails changes nothing.
- A Report carries only the Connection Status, and is answered, at `ReportAnswer` v2, with only the Release of each Plugin to run: the Minimum Connect is no longer in it. An older `ke-connect` cannot read that answer, so it must be installed again.
- `Connection` no longer has `plugins`. An App no longer shows a Plugin's download progress or a crash.
- `ActorPlugin` Emits `Reported { state }` to its parent, and requires only `Downloads`. The `Plugins` Capability is gone from `@kestack/cli-platform/plugins` and `@kestack/cli-platform/plugins/contract`.
- Connect Cloud's deployed names change, so a deploy makes new ones: its Worker, database and bucket are `ConnectCloud`, `connect-cloud-<stage>` and `connect-releases-<stage>`. The new database starts empty: every Connection reports itself again, but Display Names are gone, and a Connection forgotten while its computer was off can come back.
- Release Files are served at `/releases/`, not `/plugins/`, and the Worker reads `RELEASES` and `RELEASE_FILES`. `serve` takes `wanted`, not `plugins`.
- Connect Cloud serves two APIs. `ke-connect` calls the Heartbeat, `HeartbeatApi`, at `/heartbeat`: its Reports, and Forget when it is removed. An App calls the App API, `AppApi`, at `/rpc` as before: List, Rename, Forget and Standing. `CloudApi` is gone. `/heartbeat` refuses any call that names an Origin with 403, as no browser calls it. An older Worker has no `/heartbeat`: deploy Connect Cloud first.
- Every Heartbeat call carries the `ke-connect` version in the `ke-connect-version` header. Given a Minimum Connect, Connect Cloud answers a call below it, or with no header, `426` with one line of plain text saying how to update, before it reads the call or checks its Sign-in. So every `ke-connect` from before this one is refused. `ke-connect` prints that line and exits 75.
- `pluginPath`, `PLUGIN_MISMATCH`, `PluginMismatch` and `mismatchOf` come from `./code`, not `./cloud`. `./cloud` no longer exports `VersionGap`: import it from `@kestack/rpc-toolkit/rpc/version-gap`, where `CloudClient`'s calls still fail with it. `authInfo` is no longer exported.

**New**

- `KEY_EXPIRED` and `keyExpired`, from `./code`.
- `CodeClients.expired`, from `./code`: whether a Connection last closed its socket with `KEY_EXPIRED`, until a socket to it is answered. `CodeClients.link` stays `relinking` for that long.
- A Report says how far a cloudflared download has come, every five seconds, and the log says `Downloading cloudflared: 12.4 MB, 40s`. A cached cloudflared never shows as Downloading.

**Changed**

- Cloud Connect is now Connect Cloud, and the Shelf is now Release Files.
- `src/heartbeat` is everything `ke-connect` and Connect Cloud say to each other, `src/cloud/app-api` what Connect Cloud and an App say, and `src/connection/link` how an App reaches a Plugin through a Connection; `src/connection` holds the CLI and its Plugins. The Actor tree is Identity, Connection, then its Tunnel and Plugins, side by side, so a broken tunnel never stops a Plugin.
- `connection.json` is v2 and keeps no Connection Key: an old key reads, and is dropped at the next start. Connect Cloud's Connection record is v4, with the new status.
- A Plugin with no file says `<name> <hash> has no file; run the build`.
- `ke-connect remove` on a `ke-connect` Connect Cloud refuses says so: it prints Connect Cloud's line, and that the Connection stays listed until it is forgotten from the App. It still signs out and deletes the Connection's files.

**Fixed**

- A socket closed with 4401 or 4409 now keeps its code through a real tunnel. The server ended the socket straight after the close, so a caller read only 1006. It now waits for the caller's own close, for up to five seconds.

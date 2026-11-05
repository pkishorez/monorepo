---
'@kestack/connect': patch
'@kestack/cli-platform': patch
---

Connect is one simple tree, tied to the User's login. This is a clean break: install `ke-connect` again, and deploy Connect Cloud anew.

**Breaking**

- A Connection runs only while its User is signed in. Once Connect Cloud says the Sign-in is gone, the Connection, its tunnel and its Plugins stop until a new Sign-in. An outage changes nothing.
- A Report carries only the Connection Status, and is answered with only the Releases to run and the Minimum Connect, each at a new version. An older `ke-connect` cannot read that answer, so it must be installed again.
- `Connection` no longer has `plugins`. An App no longer shows a Plugin's download progress or a crash.
- Connect Cloud's deployed names change, so a deploy makes new ones: its Worker, database and bucket are `ConnectCloud`, `connect-cloud-<stage>` and `connect-releases-<stage>`. The new database starts empty: every Connection reports itself again, but Display Names are gone, and a Connection forgotten while its computer was off can come back.
- Release Files are served at `/releases/`, not `/plugins/`, and the Worker reads `RELEASES` and `RELEASE_FILES`. `serve` takes `wanted`, not `plugins`.

**Changed**

- Cloud Connect is now Connect Cloud, and the Shelf is now Release Files.
- `src/contract` is shared by all of Connect; `src/connection` holds the CLI and its Plugins. The Actor tree is Identity, Connection, then its Tunnel and Plugins.
- A Plugin with no file says `<name> <hash> has no file; run the build`.

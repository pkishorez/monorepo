# Connect Cloud

Where every Connection reports itself, and what decides which Plugins each one runs.

## Language

**Connection**:
One running `ke-connect` on a computer, signed in as one User. Its id belongs to the first User who reports it; another User reporting the same id is refused ConnectionTaken.
_Avoid_: machine, server, host, device, instance

**Heartbeat**:
The API only `ke-connect` calls, at `/heartbeat`: a Report, and Remove. No browser calls it, so a call that names an Origin is refused 403. Every call carries the `ke-connect` version in the `ke-connect-version` header.
_Avoid_: poll, ping, health check

**Report**:
What a Heartbeat carries: the Connection's id, name, version, address and key. It is answered with the Connection's Enabled Plugins.
_Avoid_: update, status message

**Catalog**:
Every Plugin Connect Cloud offers, each with its latest Release and whether it is enabled by default. The deploy builds it from each Plugin's `releases.json`.
_Avoid_: registry, manifest, store

**Enabled Plugin**:
A Plugin a Connection runs: every Catalog Plugin enabled by default, plus those its User enabled, minus those its User disabled, each at its Catalog Release. A choice for a Plugin no longer in the Catalog is ignored.
_Avoid_: installed, active, wanted

**Release**:
One build of a Plugin, named by the sha256 of its file, and the URL its Release File is read at.
_Avoid_: version, build, deploy

**Release File**:
A Release's one file, kept in R2 as `releases/<name>/<sha256>.mjs`, served to anyone at the same path and never changed.
_Avoid_: artifact, bundle, CDN

**Minimum Connect**:
The oldest `ke-connect` Connect Cloud answers. A Heartbeat below it, or naming no version, is answered 426 and one line of plain text, before it is read. An App sees such a Connection as outdated.
_Avoid_: required version, compatibility range

**Removed**:
A Connection its User removed. It stays removed: a Report of its id, or of any Connection signed in with the same Sign-in, is refused ConnectionRemoved. It is never listed.
_Avoid_: forgotten, deleted, archived

**Display Name**:
The name a User gives a Connection in an App, trimmed, none when blank. A Report never changes it.
_Avoid_: label, alias, nickname

**Last Seen**:
When a Connection last sent a Report, by Connect Cloud's clock.
_Avoid_: last active, updated at, online

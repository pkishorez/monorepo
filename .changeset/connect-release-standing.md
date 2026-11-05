---
'@kestack/connect': patch
---

Connect Cloud says where a Release stands, so an App can tell who is behind when a Connection refuses its Release.

- `CloudClient.Standing({ plugin, hash })` answers a `ReleaseStanding`: `Latest`, the Release it names; `Older`, one whose Release File it keeps but does not name; or `Unknown`, any other. It needs a Sign-in.
- `ReleaseFiles`, given to `serve` as `files`, must answer `head` as well as `get`. An R2 bucket does.
- `CodeClients.mismatch` now tells each mismatch, the same one again too, so an App can ask afresh each time.

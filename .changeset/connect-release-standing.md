---
'@kestack/connect': patch
---

Cloud Connect says where a Plugin's Release stands, and a Connection keeps serving its Release while the next one downloads.

**Added**

- `Standing`, a call on `CloudApi`: given a Plugin and a hash, it answers a `ReleaseStanding`, `Latest` for the Release Cloud Connect names, `Older` for another whose file is on its Shelf, or `Unknown` for any other. Signed in, as for listing Connections.
- `ReleaseStanding` from `./cloud`.

**Changed**

- The Shelf `serve` and `serveOver` take as `files` must answer `head(key)` too, as an R2 bucket does: `Standing` looks there for a Release that is not the latest.
- A Connection passes a socket for the Release it serves while the next one downloads, its Plugin State saying Downloading that one, and closes it with 4409 only once that process is gone.
- `CodeClients.mismatch` tells each 4409 close, the same one again too, so an App can ask Cloud Connect each time.
- What a Connection reports and what Cloud Connect answers a Report are as before, so every `ke-connect` and App already out there reads them.

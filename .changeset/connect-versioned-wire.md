---
'@kestack/std-toolkit': patch
'@kestack/connect': patch
'@kestack/web-platform': patch
---

Every value Connect's RPC sends is an ESchema, so a newer side reads an older one.

- `@kestack/std-toolkit`: an ESchema reads and migrates any known version, and fails a newer one with `OutdatedVersion`. New `eschemaOf`, and `OnOutdated` in `./replica`.
- `@kestack/connect`: breaking: wire types are ESchemas; use `X.schema` for an Effect Schema. Calls fail with `VersionGap` when the two sides' versions don't match.
- `@kestack/web-platform`: new `updateToNewest` in `./pwa`.
- Code reloads to its newest build when it reads something newer, and says when a Connection is too old.

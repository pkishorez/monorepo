---
'@kestack/std-toolkit': patch
'@kestack/connect': patch
'@kestack/web-platform': patch
'code': patch
---

Every value Connect's RPC sends is an ESchema, so the newer side reads the older one, and the older side says it is older.

- `@kestack/std-toolkit/eschema`: an ESchema's `schema` sent as JSON, as Effect RPC and HTTP API send it, now reads any known version and migrates it, and reads a value with no `_v` as v1; a newer version fails with `OutdatedVersion`. It was refused unless it was the latest. New `eschemaOf` finds the ESchema behind a schema; `schema` is typed `VersionedCodec`, whose constructor takes the latest value, so an RPC payload built from it is typed. `AnyEvolvingSchema`, `ValueEnvelopeEncoded` and `VersionedCodec` are exported types.
- `@kestack/std-toolkit/replica`: new `OnOutdated`, what the app does when a Strategy meets an Entity newer than it knows, just before it stops.
- `@kestack/connect`: breaking: `AuthInfo`, `TunnelCheck`, `ConnectionStatus`, `ConnectionReport`, `Connection`, `FolderEntry`, `FolderListing`, `CreatedFolder`, `SettingInfo`, `HarnessInfo`, `HarnessAccountInfo`, `SessionJobs`, `SpeechToTextState` and `WireEntity` are ESchemas: use `X.schema` where an Effect Schema is wanted. `ProjectValue` and `SessionValue` are `ProjectSchema.schema` and `SessionSchema.schema`. `HarnessAccountInfo` is at v2, with `resolvedConfigFolder` null, not absent, when an older Connect does not say it. Every payload is an ESchema too, and `transcribe` sends its audio as base64, as before. `CodeClient` and `CloudClient` calls fail with the new `VersionGap` (`older: 'client' | 'server'`) where they died of a newer answer, an Rpc the server lacks, or a payload it cannot read; the client older runs the app's `OnOutdated` first.
- `@kestack/web-platform/pwa`: new `updateToNewest`, which moves the page to the newest build once per page load; the `Pwa` service has `updateToNewest`.
- Code moves to its newest build when it reads anything newer than it knows, and says "Needs a newer Connect" when a Connection lacks a call or cannot read it.

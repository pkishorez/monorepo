---
'@kestack/devtools': patch
---

Breaking: `@kestack/lotel` is now part of `@kestack/devtools`, and so are the DevTools views that lived in the private `@devtools/ui`. Import Lotel from `@kestack/devtools/lotel`, `@kestack/devtools/lotel/rpc` and `@kestack/devtools/lotel/telemetry` instead of `@kestack/lotel`, `@kestack/lotel/rpc` and `@kestack/lotel/telemetry`. `@kestack/lotel/sqlite` is gone: `sqliteTelemetryStoreLayer` comes from `@kestack/devtools/lotel`. The Lotel subpaths ship built JavaScript with types.

`@kestack/devtools/rpc` is no longer exported: only DevTools' own server, browser UI and Client Commands use it.

Lotel's Span and Log Records drop `flowId` and `participantName`; records stored with them still read.

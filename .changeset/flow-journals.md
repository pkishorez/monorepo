---
'@pkishorez/flow': patch
'@pkishorez/effect-tracer': patch
'@pkishorez/lotel': patch
'kstack': patch
'laymos': patch
'std-toolkit': patch
'kui-toolkit': patch
---

Flows become their own package, `@pkishorez/flow`. A Flow is an append-only Journal of Entries that Participants record at runtime: events, messages and replies, activations with an outcome, waits and resumes, checks, and a close hint. Entries go to an optional Flow Telemetry sink (`FlowTelemetry.layer` forwards them to DevTools, `FlowTelemetry.layerMemory` keeps them for tests and Stories); `projectJournal` derives the swim-lane view and `mergeJournals` combines journals recorded by different clients.

Breaking changes (this remains a patch release):

- `@pkishorez/effect-tracer` removes `./flow` and `TraceRecorder.snapshotFlow` / `snapshotFlows`; use `@pkishorez/flow` Journals, Telemetry, and Projections instead.
- `@pkishorez/lotel` removes `./flow`, `ListFlows`, `GetFlow`, and the flow methods on `TelemetryStore`. `kstack` therefore replaces those procedures in `DevtoolsRpc` with `WriteFlowEntries`, `ListFlowEntries`, and `ClearFlows`; Lotel now stores traces and logs only.
- `laymos` changes flow story sections from `{ kind: 'flow', flow }` to `{ kind: 'flow', journal }`, replaces the exported `RecordedFlow` schema/type with `Journal`, and no longer derives flows from trace-recorder data.
- `std-toolkit` changes its exported sync flow contract: `FlowLane` is now a Flow `Participant`, `log` becomes `event`, `level` becomes `severity`, `participantName` / `id` become `name` / `flowId`, message and activation names must be strings, and `activated` takes the name directly.
- `kui-toolkit` requires `runtime` on `DevToolsPanel`, changes the swim-lane input from the old recorded-flow shape to a Flow `Projection`, and removes `onActivityClick`.
- `@pkishorez/effect-tracer`, `laymos`, and `std-toolkit` now require `effect@4.0.0-rc.112` instead of `4.0.0-rc.110`; `std-toolkit` also requires `alchemy@2.0.0-beta.76` instead of `2.0.0-beta.72`.

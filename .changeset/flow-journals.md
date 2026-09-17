---
'@pkishorez/flow': patch
'@pkishorez/effect-tracer': patch
'@pkishorez/lotel': patch
'@pkishorez/devtools': patch
'laymos': patch
'std-toolkit': patch
'kui-toolkit': patch
---

Flows become their own package, `@pkishorez/flow`. A Flow is an append-only Journal of Entries that Participants record at runtime: events, messages and replies, activations with an outcome, waits and resumes, checks, and a close hint. Entries go to an optional Flow Telemetry sink (`FlowTelemetry.layer` forwards them to DevTools, `FlowTelemetry.layerMemory` keeps them for tests and Stories); `projectJournal` derives the swim-lane view and `mergeJournals` combines journals recorded by different clients.

Breaking: `@pkishorez/effect-tracer` drops its `flow` module and the recorder's flow snapshots; `@pkishorez/lotel` drops flow storage, the `ListFlows` and `GetFlow` procedures, and the `./flow` entry point; DevTools gains a Flow tool backed by its own store table and the Lotel tool shows traces and logs only; `laymos` story reports carry a Journal in their flow section; `std-toolkit` sync participants write `event` instead of `log` and take `severity` instead of `level`; the `kui-toolkit` swim lane renders a Flow Projection and the devtools panel takes a runtime.

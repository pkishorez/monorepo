---
'@pkishorez/flow': patch
---

Flows become their own package. A Flow is an append-only Journal of Entries that Participants record at runtime: events, messages and replies, activations with an outcome, waits and resumes, checks, and a close hint. Entries go to an optional Flow Telemetry sink (`FlowTelemetry.layer` forwards them to DevTools, `FlowTelemetry.layerMemory` keeps them for tests and Stories); `projectJournal` derives the swim-lane view and `mergeJournals` combines journals recorded by different clients.

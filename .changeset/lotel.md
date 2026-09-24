---
'@pkishorez/lotel': patch
---

Add a `ListTraces` RPC that returns Trace Summaries for the most recently updated Traces.

Breaking: Lotel now stores traces and logs only. Flows move to `@pkishorez/flow`, so `./flow`, `ListFlows`, `GetFlow`, and the flow methods on `TelemetryStore` are removed.

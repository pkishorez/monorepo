# Layer lotel around a replaceable Telemetry Store

**Status:** accepted

lotel is divided into domain, service, and orchestrator layers. The domain owns
an internal first-class telemetry schema module and pure telemetry rules. The
`TelemetryStore` service defines storage capabilities without exposing adapter
types. The orchestrator owns the application operations, Effect RPC contract,
OTLP/HTTP contract, and their handler layers. SQLite is the first private nested
adapter; future adapters such as DynamoDB provide the same service.

This boundary keeps DevTools and lotel orchestration independent of database
keys, transactions, and errors. Named adapter layers make the storage choice
explicit without exporting the Telemetry Store, domain schemas, entities, or
raw orchestration functions.

## Consequences

- The public operations are `SaveSpans`, `InsertLogs`, `ListSpans`, `ListLogs`,
  `GetTrace`, and `ClearTelemetry`.
- Span identity is the natural composite key of trace ID and span ID. A Span
  Entity uses that pair as its primary index and uses a constant partition with
  `_u` as its timeline index.
- lotel assigns each Log Record a ULID. A Log Record Entity uses a constant
  primary partition, a constant `_u` timeline index, and a trace ID plus `_u`
  trace index.
- `GetTrace` derives Trace Details from Span and Log Record Entities and returns
  `TraceNotFound` when no Span exists.
- Batch writes make one attempt and can report partial acceptance. The first
  rewrite does not retry rejected writes.

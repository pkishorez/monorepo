# lotel — Context

lotel is the domain behind the Telemetry Tool. It receives and provides access
to local OpenTelemetry Span Records and Log Records for development inspection.

## Language

**Span**:
One recorded operation within a distributed request. A Span belongs to a Trace
through its trace ID, has a span ID, and can identify a parent Span.

**Span Record**:
A Span together with the Resource and Instrumentation Scope that produced it.
The pair of trace ID and span ID is its identity.

**Provisional Span Record**:
A Span Record published when its Span starts, before an end time is known. It
is replaced by the completed Span Record with the same identity when the Span
ends.

**Trace**:
The aggregate of all known Spans that share a trace ID. A Trace grows as more
Spans become known; it is not an independently recorded telemetry fact.

**Trace Details**:
A Trace together with all Log Records that share its trace ID, including Log
Records that do not identify a Span.

**Log Record**:
One log event together with the Resource and Instrumentation Scope that produced
it. A Log Record can identify a Trace and Span but remains distinct from both.

**Log Record ID**:
The identity that lotel assigns to a Log Record. It distinguishes separate Log
Records even when their contents are identical.

**Telemetry Store**:
The technology-neutral collection of known Span Records and Log Records.
_Avoid_: Database, Db.

**Update Cursor**:
The opaque, time-ordered value that identifies an Entity update. Consumers use
it to request Entities that changed before or after a known update.
_Avoid_: Updated timestamp.

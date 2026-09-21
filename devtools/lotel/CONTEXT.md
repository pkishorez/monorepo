# Lotel — Context

Lotel is the DevTools Tool and domain for receiving and inspecting local
OpenTelemetry Span Records and Log Records. Flows are a separate Tool with
their own [context](../flow/CONTEXT.md).

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

**Waterfall view**:
The Trace visualization that lays Spans out as duration bars against a shared
time axis, nested by parent. It answers where the time went.

**Narrative view**:
The Trace visualization that reads a Trace as a chronological story: each Span
is a headline whose Log Records and child Spans interleave in time order, and
any number of Spans can be open at once. It answers what happened and why, not
where the time went.
_Avoid_: Story view (Story is a laymos term).

**Narrative**:
The Span attribute that states a Span's intent in prose, written when the Span
starts. It is the Span's headline in the Narrative view; the outcome is told by
the Span's status and Log Records, never by rewriting the Narrative. A Span
without a Narrative falls back to its name.

**Log Record**:
One log event together with the Resource and Instrumentation Scope that produced
it. A Log Record can identify a Trace and Span but remains distinct from both.

**Event**:
A structured Log Record with an event name that records an instantaneous fact.
_Avoid_: Span Event.

**Unscoped Log Record**:
A Log Record that does not identify a Trace or Span. It has no detailed
execution context.
_Avoid_: Unscoped Event, Unscoped Activity.

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

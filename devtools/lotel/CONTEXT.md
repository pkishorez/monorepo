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

**Waterfall view**:
The Trace visualization that lays Spans out as duration bars against a shared
time axis, nested by parent. It answers where the time went.

**Parallel view**:
The Trace visualization that lays Spans out as one track per tree depth,
grouping overlapping Spans into lanes. It answers what ran concurrently.

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

**Flow**:
A correlated occurrence of work across Participants, composed of all or parts
of one or more Traces and related Log Records.
_Avoid_: Conversation, Interaction, Sequence, Long-running Trace, Session.

**Flow End**:
An Event that explicitly changes a Flow from active to completed, failed, or
cancelled. Inactivity does not end a Flow.
_Avoid_: Inferred completion.

**Flow Status**:
The lifecycle state of a Flow: active, completed, failed, or cancelled.
Completed, failed, and cancelled are terminal.

**Flow Entity**:
The stored catalog entry for a Flow. It contains the Flow ID, latest Flow Item
time, and Flow Status.

**Recorded Flow**:
The read model derived from recorded Flow Spans and Flow Log Records. Effect
Tracer's `flow` module owns its contract, recorders expose it through
`snapshotFlow` and `snapshotFlows`, and lotel's `GetFlow` returns the same model
from stored telemetry.

**Participant**:
A distinct party that performs activity in a Flow and occupies one
swim lane.
_Avoid_: Actor.

**Participant Name**:
The name that identifies and labels one Participant's swim lane within a Flow.

**Activity**:
One named unit of work performed by one Participant as part of a Flow. An
Activity records its duration and is represented by one Flow Span.

**Flow Span**:
A Span created through the Flow abstraction. It identifies its Flow and
Participant, records one Activity, and appears as one node in the Flow view.
Its ordinary descendant Spans are drill-down detail. Flow Spans are not nested.

**Flow Item**:
One Activity, Local Event, or Message in a Flow. Flow Items have a chronological
order.

**Message**:
A Flow Log Record that records information sent from one Participant to one or
more other Participants. It appears as an arrow between their swim lanes.
Sending does not imply receipt or processing.

**Log Record**:
One log event together with the Resource and Instrumentation Scope that produced
it. A Log Record can identify a Trace and Span but remains distinct from both.

**Flow Log Record**:
A Log Record that identifies a Flow and Participant. It appears independently
of Flow Spans as either a Local Event or Message.

**Local Event**:
A Flow Log Record that conveys information about its Participant. Its severity
can identify debug information, a warning, or an error.

**Event**:
A structured Log Record with an event name that records an instantaneous fact.
_Avoid_: Span Event.

**Unscoped Log Record**:
A Log Record that does not identify a Trace, Span, or Flow. It has no detailed
execution or Flow context.
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

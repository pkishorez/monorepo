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

**Flow Entity**:
The stored catalog entry for a Flow. It contains the Flow ID and latest Flow
Item time. A Flow has no lifecycle state of its own: it is a correlation scope,
not a state machine, and it never completes. Lifecycle belongs to Activations.

**Recorded Flow**:
The read model derived from recorded Flow Spans and Flow Log Records, including
each Participant's Activations paired from their Start and End records. Effect
Tracer's `flow` module owns its contract, recorders expose it through
`snapshotFlow` and `snapshotFlows`, and lotel's `GetFlow` returns the same model
from stored telemetry.

**Participant**:
A distinct party that performs activity in a Flow and occupies one
swim lane. A Participant exists for the whole Flow; it is alive only during its
Activations.
_Avoid_: Actor.

**Participant Name**:
The slash-separated Participant Path that identifies one Participant within a
Flow. Dots and other punctuation inside a path segment remain part of that
segment's name.

**Participant Path**:
The ordered names from the outermost Participant Group to one Participant,
written with `/` between segments. Every prefix is a Participant Group, and a
path may identify both a Participant and a group containing descendants.
_Avoid_: Dotted participant name.

**Participant Group**:
A shared Participant Path prefix that relates Participants in a Flow. Groups
form a hierarchy for organizing a Flow view; they are not additional parties
in the recorded work.

**Collapsed Participant Group**:
A Participant Group whose descendant Participants and Flow Items are omitted
from the Flow view. Its own Participant remains when one exists; otherwise a
compact group marker preserves the ability to expand it.
_Avoid_: Aggregate participant.

**Hidden Participant**:
A Participant lane deliberately omitted from a Flow view together with its
Flow Items, Activations, and Messages involving it. Descendant Participant
lanes remain visible; a parent Participant's own activity behaves as their
sibling. A compact marker preserves the ability to restore the lane.

**Hidden Participant Subtree**:
A Participant Path deliberately omitted together with every Participant lane
beneath it. A compact marker preserves the ability to restore the subtree.

**Step Summary**:
One expandable Flow Step representing three or more globally adjacent Flow
Items recorded by the same Participant. Messages are never members and always
break a potential summary run. The view is expanded by default. A collapsed
summary preserves its first and last items and reports how many lie between
them. While expanded its member items are individually navigable.

**Activity**:
One named unit of work performed by one Participant as part of a Flow. An
Activity records its duration and is represented by one Flow Span.

**Flow Span**:
A Span created through the Flow abstraction. It identifies its Flow and
Participant, records one Activity, and appears as one node in the Flow view.
Its ordinary descendant Spans are drill-down detail. Flow Spans are not nested.

**Flow Item**:
One Activity, Local Event, Message, Activation Start, or Activation End in a
Flow. Flow Items have a chronological order.

**Flow Step**:
One currently visible navigable row in a Flow view. A Flow Step is either one
Flow Item or a collapsed Step Summary.

**Activation**:
One continuous window during which a Participant is alive in a Flow, bounded by
an Activation Start and an Activation End. A Participant may have any number of
Activations over a Flow's life, but at most one open at a time; a second Start
before an End, or an End with no open Activation, is a warning. A Participant
that records no Activation is not dormant — it simply declines to state its
lifecycle, and its swim lane renders as if Activations did not exist.
_Avoid_: Participant lifetime, session, episode.

**Activation Outcome**:
Why an Activation ended: completed, failed, or interrupted. A failed outcome
carries its cause as an ordinary attribute. Outcome describes the Activation
only; supervision may restart the work, so a failed Activation does not mean
the Flow or the Participant failed.

**Message**:
A Flow Log Record that records information sent from one Participant to one or
more other Participants. It appears as an arrow between their swim lanes.
Sending does not imply receipt or processing.

**Reply**:
A Message that identifies the Message it answers. It closes a round trip, so
the elapsed time between the two is meaningful. Sending a Message never implies
a Reply.

**Log Record**:
One log event together with the Resource and Instrumentation Scope that produced
it. A Log Record can identify a Trace and Span but remains distinct from both.

**Flow Log Record**:
A Log Record that identifies a Flow and Participant. It appears independently
of Flow Spans as a Local Event, a Message, or an Activation boundary.

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

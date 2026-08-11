# Model Flows with OpenTelemetry records

**Status:** accepted

A Flow is application-defined correlation across Participants and can include
work from any number of independent Traces. Activities are recorded as Span
Records, while Local Events and Messages are recorded as Log Records. Each
record identifies its Flow and Participant. Trace propagation does not define
Flow membership; applications explicitly share the Flow ID.

We will reuse the OpenTelemetry ingestion and storage machinery instead of
creating a separate Flow telemetry signal. This preserves existing Resource,
Instrumentation Scope, timing, export, and Trace drill-down behavior while
adding only Flow indexes, a small Flow Entity for listing and lifecycle, and a
Flow-specific read model for the swim-lane view.

## Consequences

- A Flow contains three visible item types: Activities, Local Events, and
  Messages.
- Flow Spans are not nested. Ordinary descendant Spans remain available as
  Activity drill-down detail.
- Flow Log Records are independent of Flow Spans. Local Events appear in one
  Participant lane, and Messages appear between Participant lanes.
- The Flow Entity stores only the Flow ID, latest Flow Item time, and terminal
  lifecycle status. Counts and Flow Items are derived from Span Records and Log
  Records.
- Invalid Flow metadata does not invalidate the underlying OpenTelemetry record.
- Applications author Flow records through the standalone
  `@pkishorez/effect-tracer/flow` module. `initFlow` requires the Flow ID and
  local Participant Name; optional Participants make Message destinations
  type-safe.
- lotel projects Flow metadata into indexed fields while retaining the original
  OpenTelemetry attributes. `ListFlows` provides the catalog and `GetFlow`
  returns the canonical `RecordedFlow` read model.
- Effect Tracer's `flow` module owns the semantic attribute keys, lifecycle and
  item values, and the `RecordedFlow` contract. The recorder exposes that model
  through `snapshotFlow` and `snapshotFlows`, while lotel projects stored
  telemetry into the same contract.
- Flow visualizations consume `RecordedFlow` directly. They do not define a
  second Span Record or Log Record contract, and examples execute real Flow
  programs through the recorder instead of loading synthetic fixture data.

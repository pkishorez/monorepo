# Journal Entries are their own records, not OpenTelemetry records

**Status:** accepted (supersedes lotel ADR-0002, ADR-0003, and ADR-0004)

Flows used to be encoded as OpenTelemetry Span Records and Log Records carrying
`flow.*` attributes, stored in lotel next to every other span and log, and
reconstructed into a swim lane by reading those attributes back. That made a
Flow a subset of traces, which confused two different shapes: a trace is one
execution tree, while a Flow is a story told by many Participants across many
traces, processes, and a much longer span of time.

An Entry is now a first-class record with its own schema, its own sink
(Flow Telemetry), its own transport (the Flow RPC), and its own store table.
A span may be linked from an Entry through its Trace Link, but the span is
never the Entry. The `@pkishorez/flow` package depends on Effect alone; the
StdTable-backed Flow Store lives in DevTools, because std-toolkit's sync engine
records Flows and a store inside the package would have made the two
workspaces depend on each other.

## Consequences

- effect-tracer no longer knows about Flows. The recorder captures spans and
  logs only.
- lotel no longer stores, indexes, lists, or projects Flows, and its glossary
  no longer defines them.
- The Activity item type is gone: named spans are ordinary tracing, and an
  Entry recorded inside one carries its trace id and span id automatically.
- Stories persist Journals, so story reports written before this change do not
  decode.
- Ordering between origins is the order the Flow Store received Entries in;
  the recording clock is display only, and merging exported Journals is the
  one place clock order is used.

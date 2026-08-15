# Participant Activations replace Flow lifecycle

**Status:** accepted (amends ADR-0002)

A Participant occupies its swim lane for the whole Flow but is rarely alive for
all of it: a partition worker keeps one stable lane across repeated
`0 -> 1 -> 0` subscribe cycles, and a collection lane spans start, cleanup, and
a later restart. Nothing recorded that, so every lifeline rendered identically
from top to bottom. We introduce the **Activation** — a bounded window during
which a Participant is alive, of which a Participant may have many — and delete
Flow-level lifecycle entirely, because no producer ever knew when a Flow was
over. `initFlow` no longer takes a `participants` list.

## Considered options

An Activation could have been a Flow Span, which would supply duration and exit
status for free. Rejected: an Activation routinely outlives the trace and the
fiber that opened it, must render sensibly while still open, and would have to
contain Activities — breaking ADR-0002's "Flow Spans are not nested". An
Activation is instead a pair of Flow Log Records.

Flow Status could have been derived from Activations rather than deleted
(failed if any Activation failed, and so on). Rejected for now: a derived status
is non-monotonic, since a reactivating partition would move a Flow back out of
`completed`, and no consumer needs the value badly enough to accept that.

## Consequences

- `flow.end`, `flowStatuses`, `terminalFlowStatuses`, `isTerminalFlowStatus`,
  the `flow.status` attribute, `RecordedFlow.status`, and the lifeline
  truncation that read it are all removed. A Flow is a correlation scope, not a
  state machine. Whether a lifecycle status returns in derived form is left open.
- Start and End carry no Activation ID: at most one Activation is open per
  Participant, so the projector pairs them positionally per lane, and the same
  scan yields the double-start, double-end, and orphan-end warnings. They carry
  no name either — every Flow Item already takes its name from its log message.
- Activations are opt-in. A Participant that records none renders exactly as
  before, so nothing that exists today has to be instrumented to keep working.
- An Activation Outcome is a discriminated union, so `failed` cannot be
  constructed without a cause. The scoped form folds an Effect `Exit` into it and
  collapses defects into `failed` rather than adding a fourth outcome.
- Supervised retries stay inside one Activation. A Participant sleeping between
  attempts is alive, and a rail that strobed on every retry would be unreadable.
- Two enrichments ride the same contract: a Message now carries an ID so a Reply
  can identify it and the view can draw a round trip, and a Participant may
  publish partial keyed State that merges forward per key and survives the gap
  between Activations.

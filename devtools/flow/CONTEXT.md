# Flow — Context

Flow is the journal of what happened inside one correlated piece of work, as
told by the Participants that took part, and the swim-lane view derived from
it. It is a runtime artifact: Participants attach as the program runs, and
nothing about a Flow is known before it is executed.

## Language

**Flow**:
One correlated occurrence of work, identified only by its Flow ID. Any process
that knows the id takes part in the same Flow; there is no owner and no
creator.
_Avoid_: Conversation, Interaction, Session, Long-running Trace, Workflow.

**Flow ID**:
The string that identifies a Flow. Every process that uses the same Flow ID is
writing the same Flow.

**Journal**:
The ordered list of every Entry recorded for one Flow. It is the only source of
truth about the Flow; every other representation is derived from it.
_Avoid_: Log, history, trace.

**Entry**:
One recorded fact in a Journal: an Event, a Message, a Reply, an Activation
Start, an Activation End, a Wait, a Resume, a Check, or a Close. Every Entry
names its Flow and its Participant.
_Avoid_: Flow Item, record, span.

**Participant**:
A distinct party that records Entries in a Flow and occupies one swim lane. A
Participant is self-reliant: it reports its own lifecycle and never depends on
another Participant to describe its state.
_Avoid_: Actor, worker, lane.

**Participant Name**:
The slash-separated path that identifies one Participant within a Flow. Every
prefix of the path is a Participant Group.

**Participant Group**:
A shared Participant Name prefix that relates Participants for organizing a
view. Groups are not parties in the recorded work.

**Origin**:
The optional identity of the process or device that recorded an Entry. Two
Origins may record the same Participant Name in one Flow.
_Avoid_: client id, device id, source.

**Sequence**:
The order in which one Origin recorded its Entries. Order between Origins is
the order in which the Flow Store received them, never the recording clock.

**Trace Link**:
The trace id and span id an Entry carries when it was recorded inside a span.
It is captured without being asked for, and it is how a Flow view opens the
trace an Entry ran in.
_Avoid_: fingerprint, tracked span, span reference.

**Event**:
An Entry that records something that happened inside one Participant and
concerns no other Participant.
_Avoid_: Local Event, log.

**Message**:
An Entry that records information sent from one Participant to another.
Sending does not imply receipt.

**Reply**:
A Message that identifies the Message it answers, closing a round trip.

**Activation**:
One continuous window during which a Participant is alive in a Flow, bounded by
an Activation Start and an Activation End that share an Activation ID. A
Participant may have any number of Activations, but at most one open at a time.
_Avoid_: session, episode, span, step.

**Activation Outcome**:
Why an Activation ended: completed, failed, or interrupted. It describes the
Activation only; a failed Activation does not mean the Participant or the Flow
failed.

**Wait**:
An Entry by which a Participant states that it has suspended its own work for
a stated reason. It is answered by the same Participant's Resume; nothing else
ends a Wait.
_Avoid_: suspended, blocked, pending.

**Resume**:
An Entry by which a Participant states that it has continued after its own
Wait.

**Check**:
An Entry recording a named condition a Participant evaluated, and whether it
held. A Check that did not hold is shown, never enforced.
_Avoid_: assertion, invariant, test.

**Close**:
An Entry stating that whoever wrote it believes the Flow is finished. It is a
hint: later Entries are still accepted.
_Avoid_: end, complete, terminal state.

**Flow Telemetry**:
The sink a running process writes its Entries into. It is optional: a process
that has not chosen one discards its Entries, and choosing one at the runtime
root makes every Flow in that runtime record to memory or to a Flow Store.
_Avoid_: exporter, transport, logger.

**Flow Store**:
The persistence that keeps Journals for later reading, paging, and
subscription. It receives Entries from Flow Telemetry and never filters them.
_Avoid_: database, backend, lotel.

**Projection**:
The view-shaped reading of one Journal: lanes, paired Activations, round trips,
and Warnings. It is the one contract shared between the Flow package and any
swim-lane renderer.
_Avoid_: Recorded Flow, read model, snapshot.

**Warning**:
A Projection finding that the Journal was authored in a way that cannot be
what its author meant. An open Activation or an unanswered Wait is a state, not
a Warning.

## Flow view

**Lane**:
The vertical track one Participant occupies in a Flow view.

**Collapsed Participant Group**:
A Participant Group whose descendant Participants and Entries are omitted from
the Flow view. Its own Participant remains when one exists; otherwise a compact
group marker preserves the ability to expand it.
_Avoid_: Aggregate participant.

**Hidden Participant**:
A Participant Lane deliberately omitted from a Flow view together with its
Entries, Activations, and Messages involving it. Descendant Lanes remain
visible. A compact marker preserves the ability to restore the Lane.

**Hidden Participant Subtree**:
A Participant Name deliberately omitted together with every Lane beneath it.
A compact marker preserves the ability to restore the subtree.

**Step Summary**:
One expandable Flow Step representing three or more adjacent Entries recorded
by the same Participant. Messages are never members and always break a
potential summary run.

**Flow Step**:
One currently visible navigable row in a Flow view: one Entry or a collapsed
Step Summary.

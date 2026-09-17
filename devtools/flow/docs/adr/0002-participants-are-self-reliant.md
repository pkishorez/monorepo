# Participants are self-reliant

**Status:** accepted

A sequence diagram usually models blocking as one lifeline waiting on another:
the wait ends when the other side answers. Flow deliberately does not. A
Participant states its own Wait with a reason, and only that Participant's
Resume ends it. Nothing in the Journal makes one Participant's state depend on
another's Entries.

## Considered options

A Wait could reference the Message, timer, or token it waits for, so the
projector could pair it with the arrival that ends it. Rejected: the moment a
Participant depends on another process, Participant names and Message ids must
be negotiated across the boundary, and every cross-process program pays that
cost. Cross-Participant causality already exists through Messages and Replies,
which the projector draws as round trips; a Wait does not need to carry it
again.

## Consequences

- `wait` and `resume` are a pair inside one lane. An Activation End or a second
  Wait closes an open Wait without a Warning; a Resume with no open Wait is one
  of the four Warnings.
- A process that dies leaves an open Activation and possibly an open Wait.
  Both render as state, and no cleanup logic exists to close them.
- The reason on a Wait is free text for the reader. A Participant that happens
  to wait for a Message may name the Message id in attributes, but the
  projector never reads it.

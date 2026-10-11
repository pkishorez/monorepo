# Concept demos

One demo per concept of Effect Oak, each a marble diagram for the actor
model: the concept drawn as shapes that move, nothing that looks like an
app. The names below are the drawing's vocabulary; the concepts themselves
are defined in `packages/effect-oak/CONTEXT.md`.

## Language

**Picture**:
The one drawing a demo is: the shapes of the whole tree, drawn from the
Snapshot by Views, so Time Travel scrubs it like any app.
_Avoid_: canvas, scene, stage

**Circle**:
An Instance: a circle with its Model data written inside. It pulses when a
Message lands. Clicking it Sends the Instance's main Message.
_Avoid_: node, bubble, ball

**Marble**:
One Message on its way: a small dot that flies into a Circle and lands. Its
colour is its Source: from a click, from a Command or from a Worker.
_Avoid_: event, dot, particle

**Slot**:
One State of an Actor with States: the Actor is a rounded rectangle split
into one Slot per State, each labelled, and the Circle sits in the lit Slot.
State data is written in the lit Slot beside the Circle. A Transition slides
the Circle to the next Slot.
_Avoid_: cell, tab, lane

**Line**:
What joins a parent's Circle to a Child's Circle inside the parent's Slot: the
tree. A Child grows in at the end of its Line when its Slot lights or its key
appears, and shrinks out when its Slot goes dark or its key leaves the Model.
_Avoid_: edge, link

**Ring**:
A Worker while its Condition holds: a ring orbiting its Circle, tagged with
the Worker's name and key. Marbles leave the Ring for the Circle. The Ring
shrinks away as the Finalizer runs.
_Avoid_: spinner, loader, orbit

**Path**:
A Command while it runs: a dashed line from the Circle to the Edge. Exactly
one Marble comes back along it, then it fades.
_Avoid_: request line, arrow

**Edge**:
The outside world: the border of the Picture, where Paths go and Marbles
return from.
_Avoid_: cloud, server, network

**Band**:
A Capability a State Provides: a coloured band along the Lines from the
parent's lit Slot down to the Children that Require it.
_Avoid_: context, channel

**Climb**:
A Request: a Marble that travels up a Line from a Child to its parent, which
pulses.
_Avoid_: bubble, callback

**Strip**:
The marble diagram under the Picture: one lane per Instance alive, one
Marble per Message, newest at the right, coloured by Source. During Time
Travel a cursor sits on the Step's Marble.
_Avoid_: timeline (the devtools' Timeline is the Log tree), history

**Chip**:
A small labelled button under the Picture for a Message that is not the
Circle's main one.
_Avoid_: button, control

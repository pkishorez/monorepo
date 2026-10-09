# Effect Oak

An app is one tree of Nodes that lives outside React. Each Node is a small state machine driven by Messages; Effect runs everything that touches the outside world, and React only draws the tree.

## Language

### The tree

**Node**:
One piece of the app: its Model and States, the Messages it accepts, its Update, what it Requires and Provides, and its Children. Defined with `make`, made to run with `build`. A description, not a running thing and not a React component.
_Avoid_: component, machine, actor

**Instance**:
One running Node at one Path: its current Model, State and Children. Numbered in the order its tree created it, so a Replay numbers its Instances the same way. Created when its parent enters a State, destroyed when it leaves. Views draw an Instance; Messages are sent to one.
_Avoid_: live node, store, actor

**Path**:
Where an Instance sits in the tree, built from its parent's Path and the Child's name, so the same app always gives the same Paths. Each time a Node is created at a Path it is a new Instance; a Message for an Instance that is gone is dropped.
_Avoid_: id, address, key

**Child**:
A Node that exists while its parent is in a given State. Entering the State creates it; leaving the State destroys it and everything it owns. The State decides which Children exist, never the View.
_Avoid_: slot, dependency, subcomponent

### Data and change

**Model**:
The data a Node keeps in every State. Always serializable, described with Schema.
_Avoid_: shared, store, context, props

**State**:
Which one of a Node's exclusive situations it is in, with the data that only exists in that situation. A Node without States has exactly one. A Node's Model and State together are all of its data.
_Avoid_: status, mode, phase

**Transition**:
An Update that ends in a different State than it started in. Leaving a State ends its Lifetime and destroys its Children; entering one creates its Children and starts its Lifetime. Staying in the same State with new data is not a Transition.
_Avoid_: re-entry, navigation

**Message**:
A fact that happened, addressed to one Node: a click, a timer tick, a Command's result. The only way a Model or State changes.
_Avoid_: event (XState's word; Effect Oak uses Elm's names), action

**Time**:
When a Message arrived, in milliseconds since the Runtime started, not counting time spent Paused. Stamped by the Runtime and kept with the Message. Update reads it, so a Replay gets the same answer as the live app. The one clock the app, its Log and its timeline share.
_Avoid_: timestamp, now, clock (on its own)

**Update**:
The pure rule that takes the current Model, State, a Message and its Time and returns the next Model and State plus any Commands. It never sees Services, so Replay can run it with nothing else. Written per State; a Message with no rule in the current State is ignored.
_Avoid_: reducer, handler

**Log**:
Every Message in the order it arrived, with the Instance and Path it went to, its Time, and what came of it: handled, ignored, or dropped because its Instance was gone. For reading; Replay needs only the Messages.
_Avoid_: history, journal, event store

**Replay**:
Rebuilding the tree from its Messages alone: init, then each Message with its Time through Update, handed to the Instance with its number. A Message for an Instance that is gone is dropped, as it was live. No Services, Lifetimes or Commands run, and sends are dropped.
_Avoid_: rehydrate, restore

**Time Travel**:
Drawing the app as a Replay at any Time from 0 (right after init) to now: every Message up to that Time is played, and the app is drawn at that Time. The live app keeps running underneath.
_Avoid_: undo, rewind, snapshot history

**Pause**:
Stopping the app's Time so Time Travel can look at the past without the app moving on. While Paused, Views of the past are shown and nothing can be sent from them; resuming carries Time on from where it stopped.
_Avoid_: freeze, suspend

### Effects

**Command**:
One piece of work an Update asks for: an Effect that runs once and may end with one Message. It gets the Node's Services from Effect (`yield* Session`). Owned by its Node; destroying the Node interrupts it.
_Avoid_: effect, side effect, task

**Lifetime**:
Work that runs for exactly as long as a Node is in one State, sending Messages as it goes: a timer, a socket, a first fetch. A Stream that gets Services from Effect, like a Command. Leaving the State interrupts it.
_Avoid_: subscription, activity, resource, entry action

### Services

**Service**:
A value a Node gives to everything below it while it is in a State: a projection of its Model and State, functions that return Effects, or both. Identified by an Effect service key.
_Avoid_: context, interface, capability, dependency

**Requires**:
The Services a Node needs from above, each under a local name. A Child's Requires must be covered by its parent's Requires or by what the parent Provides in that State, so a Service passing through a Node is Required by it too. The root's Requires come from the app's Layer.
_Avoid_: inject, consume, depends on

**Provides**:
The Services a Node gives its descendants, per State. Declared in the Node's definition, built in `build`. The nearest Provider wins.
_Avoid_: exposes, exports

**Request**:
A function on a Service that sends a Message to the Node that Provides it, so a descendant can ask an ancestor for a change without knowing where it is. Called from a Command, never from a View.
_Avoid_: output, bubble, callback, event

### Drawing

**View**:
How one Node is drawn: a React component that reads the Model, State and current Children of one Instance, and can only Send. It never sees Services, so it draws a Replay exactly like the live app. Kept apart from the Node, so the same Node can be drawn more than one way or not at all. Anything that moves between Messages is worked out here, at each Frame, from the Model, State and Time: the Model says what is happening, the View decides how that looks.
_Avoid_: render, template, component (on its own)

**Frame**:
One moment a View is drawn at, given as a Time: every animation frame while live, every move of the timeline during Time Travel. React renders only when a Message changes the Instance; a Frame moves what is already drawn. Nothing about a Frame is stored.
_Avoid_: tick, render

**Send**:
Hand a Message to a Node. The only thing a View can do besides drawing.
_Avoid_: dispatch, emit, trigger

**Runtime**:
The live app: the tree of Instances, plus the Services, Lifetimes and Commands that connect it to the outside world, and the Log.
_Avoid_: store, engine, interpreter

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
When a Message arrived, in milliseconds since the Runtime started. Stamped by the Runtime and kept with the Message. Update reads it, so a Replay gets the same answer as the live app. The one clock the app, its Log and its Frame share.
_Avoid_: timestamp, now, clock (on its own)

**Update**:
The pure rule that takes the current Model, State, a Message and its Time and returns the next Model and State plus any Commands. It never sees Services, so Replay can run it with nothing else. Written per State; a Message with no rule in the current State is ignored.
_Avoid_: reducer, handler

**Log**:
A tree of entries, one per Message, each pointing to the entry before it: the Message, the Instance and Path it went to, its Time, and what came of it: handled, ignored, or dropped because its Instance was gone. Replay needs only the Messages on the way to an entry.
_Avoid_: history, journal, event store

**Head**:
The Log entry the Runtime adds the next Message after. Starting the Runtime from an earlier entry moves the Head there.
_Avoid_: cursor, current, tip

**Branch**:
The line of entries grown from one start of the Runtime: starting from an earlier entry begins a new Branch beside the old one, which stays in the Log. Time on a new Branch carries on from the entry it starts from.
_Avoid_: fork (as a noun), timeline, run, session

**Replay**:
Rebuilding the tree from its Messages alone: init, then each Message with its Time through Update, handed to the Instance with its number. A Message for an Instance that is gone is dropped, as it was live. No Services, Lifetimes or Commands run, and sends are dropped.
_Avoid_: rehydrate, restore

**Step**:
One point Time Travel can show: the app right after one Log entry, or right after init. Nothing between two Messages is a Step.
_Avoid_: index, tick, position

**Time Travel**:
Drawing the app as a Replay at a Step: every Message up to it is played, and the app is drawn at that Message's Time. The live app keeps running underneath, and nothing can be sent from the past.
_Avoid_: undo, rewind, snapshot history, pause

### Effects

**Command**:
One piece of work an Update asks for: an Effect that runs once and may end with one Message. It gets the Node's Services from Effect (`yield* Session`). Owned by its Node; destroying the Node interrupts it, and an Update can replace its Node's running Commands with new ones (the latest plan wins).
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
The Time the Views are drawn at, one value for the whole app that every View is given: it moves at every animation frame while live, and stands still at the Step's Time during Time Travel. React renders only when a Message changes the Instance; the Frame moves what is already drawn. Nothing about it is stored.
_Avoid_: tick, render

**Send**:
Hand a Message to a Node. The only thing a View can do besides drawing.
_Avoid_: dispatch, emit, trigger

**Runtime**:
The live app: the tree of Instances, plus the Services, Lifetimes and Commands that connect it to the outside world, and the Log. One per app, however many times the app is drawn; it starts when the app is first drawn and stops when the last drawing goes. Only code outside the tree, like a timeline, sees it: it reads the Log and chooses the Step shown.
_Avoid_: store, engine, interpreter

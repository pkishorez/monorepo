# Effect Oak

An app is one tree of Actors that lives outside React. Each Actor is a small state machine driven by Messages; Effect runs everything that touches the outside world, and React only draws the tree.

## Language

### The tree

**Actor**:
One piece of the app: its Model and States, the Messages it accepts, its Update, the Capabilities it Requires and Provides, and the Children it Invokes. A state machine and an actor at once: Messages are the only way it changes, and its State decides which Actors exist below it. A description, not a running thing and not a React component.
_Avoid_: Node, component, machine

**Instance**:
One running Actor in the tree: its ID, its current Model and State, and its Children. Called an "actor instance" where "Instance" alone is unclear. Views draw an Instance; Messages are sent to one.
_Avoid_: ref, process, live node, store

**Instance ID**:
Who an Instance is, made from its parent's ID, the Child's name, its key if it has one, and how many times the parent has Invoked that Child so far. The same Messages always give the same IDs, and an Instance Invoked again gets a new ID, so a Message for an Instance that is gone is dropped.
_Avoid_: path, address, number

**Child**:
An Actor its parent Invokes while in a given State. A fixed Child exists for as long as the State lasts; a keyed Child exists for as long as its key is in the parent's Model too. The State and the Model decide which Children exist, never the View.
_Avoid_: slot, dependency, subcomponent

**Input**:
The data a parent hands a Child when it Invokes it, which the Child's init starts from. From then on the Child owns that data; the parent keeps only the key.
_Avoid_: props, params, args

**Invoke**:
What a parent does to its Children: the State, and for keyed Children the Model, say which exist, and each one starts or stops as that changes. Leaving a State stops every Child it Invoked and everything they own. Declared in the Actor's definition, never called from code.
_Avoid_: spawn, create, mount

**Snapshot**:
The whole app as one value: every Instance, with its ID, its Actor's name, its State, its Model and its Children. The only truth about the app's data; Replay rebuilds it, and saving the app saves it.
_Avoid_: store, app state, actor system

### Data and change

**Model**:
The data an Actor keeps in every State. Always serializable, described with Schema.
_Avoid_: shared, store, context, props

**State**:
Which one of an Actor's exclusive situations it is in, with the data that only exists in that situation. An Actor without States has exactly one. An Actor's Model and State together are all of its data.
_Avoid_: status, mode, phase

**Transition**:
An Update that ends in a different State than it started in. Leaving a State ends its Lifetime and stops its Children; entering one Invokes its Children and starts its Lifetime. Staying in the same State with new data is not a Transition, though keyed Children still follow the Model.
_Avoid_: re-entry, navigation

**Message**:
A fact that happened, addressed to one Instance: a click, a timer tick, a Command's result. The only way a Model or State changes.
_Avoid_: event (XState's word; Effect Oak uses Elm's names), action

**Envelope**:
A Message with the Instance ID it is sent to and its Time: what a Send makes, what Replay plays, and the heart of every Log entry.
_Avoid_: event, packet

**Time**:
When a Message arrived, in milliseconds since the Runtime started. Stamped by the Runtime and kept with the Message. Update reads it, so a Replay gets the same answer as the live app. The one clock the app, its Log and its Frame share.
_Avoid_: timestamp, now, clock (on its own)

**Update**:
The pure rule that takes the current Model, State, a Message and its Time and returns the next Model and State, and maybe a Command. It never sees Capabilities, so Replay can run it with nothing else. Written per State; a Message with no rule in the current State is ignored.
_Avoid_: reducer, handler

**Log**:
A tree of entries, one per Message, each pointing to the entry before it: the Envelope, and what came of it: handled, ignored, or dropped because its Instance was gone. Replay needs only the Messages on the way to an entry.
_Avoid_: history, journal, event store

**Head**:
The Log entry the Runtime adds the next Message after. Starting the Runtime from an earlier entry moves the Head there.
_Avoid_: cursor, current, tip

**Branch**:
The line of entries grown from one start of the Runtime: starting from an earlier entry begins a new Branch beside the old one, which stays in the Log. Time on a new Branch carries on from the entry it starts from.
_Avoid_: fork (as a noun), timeline, run, session

**Replay**:
Rebuilding the Snapshot from Messages alone: init, then each Message with its Time through Update, handed to the Instance with its ID. A Message for an Instance that is gone is dropped, as it was live; Replay never Invokes an Instance the Messages did not. No Capabilities, Lifetimes or Commands run.
_Avoid_: rehydrate, restore

**Step**:
One point Time Travel can show: the app right after one Log entry, or right after init. Nothing between two Messages is a Step.
_Avoid_: index, tick, position

**Time Travel**:
Drawing the app as a Replay at a Step: every Message up to it is played, and the app is drawn at that Message's Time. The live app keeps running underneath, and nothing can be sent from the past.
_Avoid_: undo, rewind, snapshot history, pause

### Effects

**Command**:
One piece of work an Update asks for: an Effect that may Send its Instance any number of Messages, such as one per chunk of a stream. It gets its Actor's Capabilities from Effect (`yield* Session`). Owned by its Instance, not its State: it runs until it ends or the Instance stops, and a Command started under the same key interrupts it (the latest plan wins).
_Avoid_: effect, side effect, task

**Lifetime**:
Work that runs for exactly as long as an Instance exists, or as long as it is in one State: a socket, a timer, a first fetch. A scoped Effect that Sends its Instance Messages and reads its current Model and State; it gets Capabilities from Effect, like a Command. When the Instance stops or leaves the State, its Scope closes.
_Avoid_: subscription, activity, resource, entry action

### Capabilities

**Capability**:
What an Actor can rely on from above, or offers to everything below it while in a State: a projection of its Model and State, functions that return Effects, or both. Built on an Effect service and identified by its key.
_Avoid_: service (for this), context, interface, dependency, input, output

**Requires**:
The Capabilities an Actor needs from above, each under a local name. A Child's Requires must be covered by its parent's Requires or by what the parent Provides in that State, so a Capability passing through an Actor is Required by it too. The root's Requires come from the app's Layer.
_Avoid_: inject, consume, depends on

**Provides**:
The Capabilities an Actor gives its descendants, per State. Declared in the Actor's definition and built once each time the State is entered, torn down when it is left; a Capability that follows the Model watches its Instance's changes itself. The nearest Provider wins.
_Avoid_: exposes, exports

**Request**:
A function on a Capability that sends a Message to the Instance that Provides it, so a descendant can ask an ancestor for a change without knowing where it is. Called from a Command, never from a View.
_Avoid_: output, bubble, callback, event

### Drawing

**View**:
How one Actor is drawn: a React component that reads the Model, State and current Children of one Instance, and can only Send. It never sees Capabilities, so it draws a Replay exactly like the live app. Kept apart from the Actor, so the same Actor can be drawn more than one way or not at all. Anything that moves between Messages is worked out here, at each Frame, from the Model, State and Time: the Model says what is happening, the View decides how that looks.
_Avoid_: render, template, component (on its own)

**Frame**:
The Time the Views are drawn at, one value for the whole app that every View is given: it moves at every animation frame while live, and stands still at the Step's Time during Time Travel. React renders only when a Message changes the Instance; the Frame moves what is already drawn. Nothing about it is stored.
_Avoid_: tick, render

**Send**:
Hand a Message to an Instance, making an Envelope that is handled at once. The only thing a View can do besides drawing; Lifetimes and Commands can Send only to their own Instance.
_Avoid_: dispatch, emit, trigger

**Runtime**:
The live app: the Snapshot, plus the Capabilities, Lifetimes and Commands that connect it to the outside world, and the Log. One per app, however many times the app is drawn; it starts when the app is first drawn and stops when the last drawing goes. Only code outside the tree, like a timeline, sees it: it reads the Log and chooses the Step shown.
_Avoid_: store, engine, interpreter, actor system

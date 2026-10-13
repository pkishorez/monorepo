# Effect Oak

An app is one tree of Actors that lives outside React. Each Actor is a small state machine driven by Messages; Effect runs everything that touches the outside world, and React only draws the tree.

## Language

### The tree

**Actor**:
One piece of the app: its Model and States, the Input and Props it takes, the Messages it accepts, its Update, the Capabilities it Requires and Provides, and the Children it Invokes. A state machine and an actor at once: Messages are the only way it changes, and its State decides which Actors exist below it. A description, not a running thing and not a React component. Made in two steps: its Schemas and Requires first, then how it behaves: written at the top, for as long as the Instance lives, or written in a State, for as long as that State lasts.
_Avoid_: Node, component, machine

**Instance**:
One running Actor in the tree: its ID, its current Model, State and Props, and its Children. Called an "actor instance" where "Instance" alone is unclear. Views draw an Instance; Messages are sent to one.
_Avoid_: ref, process, live node, store

**Instance ID**:
Who an Instance is, made from its parent's ID, the Child's name, its key if it has one, and how many times the parent has Invoked that Child so far. The same Messages always give the same IDs, and an Instance Invoked again gets a new ID, so a Message for an Instance that is gone is dropped.
_Avoid_: path, address, number

**Child**:
An Actor its parent Invokes. Written at the top, a fixed Child exists for as long as its parent and lasts through every Transition; written in a State's block, for as long as that State lasts. A keyed Child exists for as long as its key is in the parent's Model too. The State and the Model decide which Children exist, never the View.
_Avoid_: slot, dependency, subcomponent

**Input**:
The data a parent hands a Child when it Invokes it, which the Child's init starts from. From then on the Child owns that data; the parent keeps only the key. Read once: what the parent wants the Child to see from then on is its Props, and a parent that must start a Child over gives it a new key, which is a fresh Instance.
_Avoid_: params, args, controlled input

**Invoke**:
What a parent does to its Children: the State, and for keyed Children the Model, say which exist, and each one starts or stops as that changes. Leaving a State stops every Child it Invoked and everything they own. Declared in the Actor's definition, never called from code.
_Avoid_: spawn, create, mount

**Snapshot**:
The whole app as one value: every Instance, with its ID, its Actor's name, its State, its Model and its Children. The only truth about the app's data, and Replay rebuilds it from the History. Saving the app saves its History; a lighter save is a History of one Restore.
_Avoid_: store, app state, actor system

### Data and change

**Model**:
The data an Actor keeps in every State. Always serializable, described with Schema. Every new Model, from init or an Update, is checked against its Schema, as is every State and Input; one that does not match changes nothing.
_Avoid_: shared, store, context, props

**Props**:
The data a parent hands a Child for as long as it lives, worked out from the parent's Model and State after every Update of the parent. The Child reads it and never writes it: its Update sees it with every Message, its Workers' Conditions read it, and its View draws it. A change runs none of the Child's rules; the Child sees it at its next Message. Only the direct parent hands Props. Never in the History: Replay works it out again from the parent.
_Avoid_: context (Effect's word), controlled input, parameters

**State**:
Which one of an Actor's exclusive situations it is in, with the data that only exists in that situation. An Actor without States has exactly one. An Actor's Model and State together are all of its data.
_Avoid_: status, mode, phase

**Transition**:
An Update that ends in a different State than it started in. Leaving a State stops its Workers and its Children; entering one Invokes its Children and starts its Workers. Staying in the same State with new data is not a Transition, though keyed Children still follow the Model.
_Avoid_: re-entry, navigation

**Message**:
A fact that happened, addressed to one Instance: a click, a timer tick, a Command's result. The only way a Model or State changes. Every Message Sent is checked against its Actor's Schema first, and one that does not match is refused at the Send and never reaches Update or the History. Always serializable, so a History can be saved.
_Avoid_: event (XState's word; Effect Oak uses Elm's names), action

**Restore**:
A Message to the root that replaces the whole Snapshot with one saved before, stamped with that Snapshot's Time. The only Message no Update sees: Replay checks each Instance against its Actor's Schemas and puts the Snapshot in place, or warns and leaves init as it was. A History of one Restore is the light way to save an app: the Step before it is init, and nothing before the Restore can be travelled to but init.
_Avoid_: checkpoint, hydrate, load, seed

**Envelope**:
A Message with the Instance it is sent to, its Source and its Time: what a Send makes, what Replay plays, and all a History entry holds.
_Avoid_: event, packet

**Source**:
Who Sent a Message: the Instance, and what in it Sent: its View, a Command by its name, a Worker by its name and key, or what it Provides. The same Instance the Message goes to, except for a Request, which comes from the Instance whose Command or Worker made it. A Message Sent from outside the tree, by a test or a tool, comes from outside, not from an Instance; a Restore no one Sent: it was given to the app. Kept with the Envelope to show who talked to whom; Replay never reads it.
_Avoid_: sender, origin, caller

**Time**:
When a Message arrived, in milliseconds since the Runtime started. Stamped by the Runtime and kept with the Message. Update reads it, so a Replay gets the same answer as the live app. The one clock the app and its History share.
_Avoid_: timestamp, now, clock (on its own)

**Update**:
The pure rule that takes the current Model, State and Props, a Message and its Time and returns the next Model and State, and the Commands it asks for. It never sees Capabilities, so Replay can run it with nothing else. Written under `on`, at the top or in a State's block; the State's rule wins over the top one, and a Message with no rule in either is ignored. A Message with no rule anywhere, at the top or in any State, is always ignored, and making its Actor warns of it. The only thing that changes the Model, so whatever is running is readable from it.
_Avoid_: reducer, handler

**History**:
Everything that happened to an app: a tree of entries, one per Message, each pointing to the entry before it and holding its Envelope, nothing else, and the Head the next one grows from. What came of a Message is worked out from the Snapshots before and after it. Replay needs only the Messages on the way to an entry. Saved and given back, it is where an app carries on from, on a server, at build time, after a reload, or after its code changed.
_Avoid_: log, journal, event store

**Head**:
The History entry the next Message goes after. It moves to each new entry, and to an earlier one only while no Runtime runs on the History; starting there grows a new Branch.
_Avoid_: cursor, current, tip

**Branch**:
The line of entries grown from one start of the Runtime: starting from an earlier entry begins a new Branch beside the old one, which stays in the History. Time on a new Branch carries on from the entry it starts from.
_Avoid_: fork (as a noun), timeline, run, session

**Replay**:
Rebuilding the Snapshot from Messages alone: init, then each Message with its Time through Update, handed to the Instance with its ID, and a Restore in place of the whole Snapshot. A Message for an Instance that is gone is dropped, as it was live; Replay never Invokes an Instance the Messages did not. Props are worked out again from each parent. A Message that no longer fits its Actor's Schema is warned of and skipped. No Capabilities, Workers or Commands run.
_Avoid_: rehydrate, rebuild

**Step**:
One point Time Travel can show: the app right after one History entry, or right after init. Nothing between two Messages is a Step.
_Avoid_: index, tick, position

**Time Travel**:
Drawing the app as a Replay at a Step: every Message up to it is played, and the app is drawn at that Message's Time. The live app keeps running underneath, and nothing can be sent from the past.
_Avoid_: undo, rewind, snapshot history, pause

### Work

**Command**:
An errand an Update asks for: made once, outside any Update, as a name, the Schema of its args and an Effect run from those args; an Update asks for it with its args. It ends with at most one Message, Sent to its Instance, and turns its own failures into that Message. Fire and forget: never in the History, never replayed. For work with nothing to show while it runs: replace the URL, tell a cache, make a Request. It gets Capabilities from Effect. Nothing stops it but its Instance stopping; work that must be stopped, show progress, or survive a stop is a Worker.
_Avoid_: effect, side effect, task, invoke, cancel (there is none)

**Worker**:
Work that runs for exactly as long as its Condition holds: a socket, a timer, an upload, a multi-step process. A named, scoped Effect that Sends its Instance any number of Messages and reads its current Model and State; it gets Capabilities from Effect. It must be able to start from the Model alone, because it starts again whenever its Condition holds anew. One Worker runs per key its Condition names.
_Avoid_: lifetime, subscription, activity, process, job, Web Worker

**Condition**:
What a Worker is owned by, read from its Instance's own Model, State and Props whenever they change: the Instance, or the State it is written in, and within it always, a yes or no, or a list of keys. When a key appears its Worker starts; when it goes, the Worker's Scope closes and its finalizers run. Nothing stops a Worker but its Condition, so stopping work is changing the Model.
_Avoid_: trigger, guard, dependency, cancel, handle

**Finalizer**:
What a Worker does as its Scope closes, whether it finished or its Condition stopped: close the outside world. It never Sends; the Update that changed the Condition already recorded why, with its Time.
_Avoid_: cleanup hook, teardown, on exit

### Capabilities

**Capability**:
What an Actor can rely on from above, or offers to everything below it while in a State: a projection of its Model and State, functions that return Effects, or both. Built on an Effect service and identified by its key.
_Avoid_: service (for this), context, interface, dependency, input, output

**Requires**:
The Capabilities an Actor's own Workers, Commands and Provides may use, as a list: nothing else is in reach of its code. It is about the Actor alone, never its Children. What an Actor still needs from above is its Requires plus whatever its Children need that it does not Provide where they are placed; that need bubbles up until an ancestor Provides it, and the app's Layer covers the rest.
_Avoid_: inject, consume, depends on

**Provides**:
The Capabilities an Actor gives its descendants, as one Layer written at the top, one written in each State, or both: written at the top, it is built once when the Instance starts and reaches the Children of every State; written in a State's block, it is built each time that State is entered, torn down when it is left, and reaches only that State's Children. It cancels out what the Children below it need. A Capability that follows the Model watches its Instance's changes itself. The nearest Provider wins. Most belong at the top; a State Provides only what can exist only in it.
_Avoid_: exposes, exports

**Request**:
A function on a Capability that sends a Message to the Instance that Provides it, so a descendant can ask an ancestor for a change without knowing where it is. Called from a Command or a Worker, never from a View.
_Avoid_: output, bubble, callback, event

### Drawing

**View**:
How one Actor is drawn: a React component that reads the Model, State, Props and current Children of one Instance, and can only Send. A parent's View hands it nothing but where to draw. One function draws every State, so a Transition keeps the DOM, and an Instance that has stopped is drawn with its last data while it leaves the page. It never sees Capabilities, so it draws a Replay exactly like the live app. Kept apart from the Actor, so the same Actor can be drawn more than one way or not at all.
_Avoid_: render, template, component (on its own)

**Send**:
Hand a Message to an Instance, making an Envelope that is handled at once. The only thing a View can do besides drawing; Workers and Commands can Send only to their own Instance.
_Avoid_: dispatch, emit, trigger

**Host**:
What the Runtime gives the Instances it runs: a way to Send to any Instance, the Time, and the Capabilities of the app's Layer. Only the Runtime holds a Host; an Instance's own Workers, Commands and Provides can Send only to it.
_Avoid_: self, context, environment

**Runtime**:
What runs a History: it starts the root Instance at the History's Head, hands it every Message through the one Mailbox, and writes each one into the History. Everything else about an Instance's life happens in the Instance. One per app, however many times the app is drawn; it starts when the app is first mounted in a browser, and stops when the last drawing goes. Drawn with no Runtime, on a server or at build time, the app shows its History's Head and cannot Send.
_Avoid_: store, engine, interpreter, actor system

**App**:
An Actor tree with its Layer, made into one React component: it runs one Runtime for every mount, and draws the Snapshot at the Step shown, or live. Each View draws its Instance from that Snapshot; a Send from a past Step is dropped.
_Avoid_: stage, root, provider

### Seeing the app

**Timeline**:
The whole History drawn as a graph, newest first: one row per Message on every Branch, each a name and a dot. Each Branch keeps the lane it was born in: the first runs down the middle and every fork gets its own lane to the right, so nothing moves as the History grows. The Branch in view is lit where it stands. Picking a dot chooses the Step shown everywhere; a dot on another Branch brings that Branch into view.
_Avoid_: history, message list

**Branch in view**:
The one Branch the Timeline and the Inspector walk, from init to its latest entry: the Head's, until another is picked. A Step before a split is on every Branch that grows from it, so picking it keeps the Branch in view.
_Avoid_: selected branch, active branch

**Change**:
What one Step did to the Snapshot: the Instances and Workers it started and stopped, its Transitions, and every field of a Model, State or Props that took a new value, with the value it had before. Init's Change is every Instance starting. An ignored or dropped Message, or one whose Update gave back the same data, has no Change.
_Avoid_: diff, delta, patch, mutation

**Inspector**:
One Step taken apart, on a map of the whole app drawn from its Actors: every State each can be in, every Child each State Invokes and every Worker it can own, dim until an Instance runs there. Which Workers a Step expects follows from the Snapshot; whether each is running, finished or failed is known live only. An Actor without States is drawn without its one State. The Step lights up the Instances that exist and their States, with its Change marked, and any Instance's data. Moves one Step at a time along the Branch in view.
_Avoid_: devtools (the repo's DevTools is another thing), debugger, panel

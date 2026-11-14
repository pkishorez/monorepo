# Kabuki

An app is one tree of Actors that lives outside React. Each Actor is a small state machine driven by Messages; Effect runs everything that touches the outside world, and React only draws the tree.

## Language

### The package

**Part**:
One of the four pieces kabuki is learned and taken in, each its own subpath using only the ones below it: core, the Actors and how they run; react, drawing them; routing, giving them a place in the URL; start, serving them as one app. An app takes as many as it needs, from the bottom up.
_Avoid_: layer (that is Effect's Layer), module, package (kabuki is one), door (a Part has several)

### The tree

**Actor**:
One piece of the app: its Model and States, the Input and Props it takes, the Messages it accepts, its Update, the Capabilities it Requires and Provides, and the Children it Invokes. A state machine and an actor at once: Messages are the only way it changes, and its State decides which Actors exist below it. A description, not a running thing and not a React component. Made in two steps, its Shape and its Build, which together are its Definition.
_Avoid_: Node, component, machine

**Shape**:
What an Actor is, as `Actor.define` gives it: its name, its Schemas, what it Emits, the Queries it answers and its Requires, which fix every type. It is the Actor's whole surface: what it holds, hears, tells its parent and answers. Each Schema is written whole, or as what it is made of: a struct as its fields, a tagged union as its cases by tag. It runs nothing and imports only other Shapes, so anything may import it. It builds its Actor itself: `Counter.build({ … })`. Named after the Actor: `Counter`.
_Avoid_: definition (that is the Shape and the Build together), spec, schema (on its own), type

**Build**:
How a defined Actor behaves, made by its Shape's `build`: its init, its Updates, its Children, Workers and Provides, and its answers to its Queries, written at the top, for as long as the Instance lives, or under `states`, in a State's block, for as long as that State lasts. It is what runs, what a parent Invokes and what a View draws. Named after the Actor with `Live`: `CounterLive`, beside its Shape.
_Avoid_: implementation, instance (an Instance is a running Build)

**Definition**:
An Actor's Shape and its Build together, as one plain tree: each Child's place in it holds that Child's own Definition, at the top or in a State. What a Runtime runs, read by kabuki's own code alone; a tool reads the Blueprint.
_Avoid_: engine form, compiled, spec

**Blueprint**:
What an Actor is and does, made from its Definition, with nothing running: its name, its Requires and its Schemas, and for each level, the top and each of its States, the Messages it has an Update for, its Workers and their Conditions, its Children with theirs, its Queries and the Capabilities it Provides. Each State's level also holds the Schema of the data that State carries, and its States are exactly its levels besides the top. A Child's place in it holds that Child's own Blueprint, so the root's Blueprint reaches the whole tree an app can grow. A Runtime runs the Definition; every tool that describes an Actor reads the Blueprint, never the Definition.
_Avoid_: definition (that is how the engine holds the Actor), compiled, schema, spec

**Instance**:
One running Actor in the tree: its Address, its current Model, State and Props, and its Children. Called an "actor instance" where "Instance" alone is unclear. Views draw an Instance; Messages are sent to one. In a Snapshot it is plain data, and its State's tag is repeated at its top, so a check on it tells which State it is in and which Children that State holds. Code outside the tree reaches the root Instance through its Runtime, typed by its Actor and always live, and from it any Instance below, or any one straight at its Address, which is the same Instance: it reads their data and their Workers, Sends to them, asks their Queries and waits `until` their data passes a test, and changes nothing else. An Instance that is gone from the Runtime's Snapshot reads as it was when last read, and nothing Sent to it arrives.
_Avoid_: ref, process, live node, store

**Address**:
Who an Instance is and where it lives, as one path from the root: its parent's Address, then the State its Child is written in if it is written in one, the Child's name, its key if it has one, and how many times the parent has Invoked that Child so far, as in `App/Inside:downloads#2/files[3]#1`. The same Messages always give the same Addresses, and an Instance Invoked again gets a new one, so a Message for an Instance that is gone is dropped. Without its keys and counts, the same path is the Instance's place in the root's Blueprint, which is how a tool finds what an Instance is. An Address taken from a Snapshot knows its Actor, so only that Actor's Messages can be Sent to it.
_Avoid_: instance ID, path, number, URL (the Router's is another thing)

**Child**:
An Actor its parent Invokes, named in a level's `children` and made with `Actor.child`, with a Condition, as a Worker is written: `children: { rows: Actor.child(RowLive, { each, input, props, emits }) }`. `Actor.child` is typed by the level it is written in, so every function in it is checked against the parent's data and the Child's Actor. Written at the top, a Child exists for as long as its parent and lasts through every Transition; written in a State's block, for as long as that State lasts. Within that it exists always, `while` a test on the parent's data holds, or once per key `each` names. A Child that may be absent is typed so in its parent's View. The State and the Model decide which Children exist, never the View. A parent controls a Child only by whether it exists and by its Props, and never Sends to it; it hears from it only what it Emits. What a parent must control, it owns.
_Avoid_: slot, dependency, subcomponent

**Input**:
The data a parent hands a Child when it Invokes it, which the Child's init starts from. From then on the Child owns that data; the parent keeps only the key. Read once: what the parent wants the Child to see from then on is its Props, and a parent that must start a Child over gives it a new key, which is a fresh Instance.
_Avoid_: params, args, controlled input

**Invoke**:
What a parent does to its Children: the State and each Child's Condition say which exist, and each one starts or stops as that changes; one that comes back is a fresh Instance. Leaving a State stops every Child it Invoked and everything they own. Declared in the Actor's Build, never called from code.
_Avoid_: spawn, create, mount

**Snapshot**:
The whole app as one plain value: every Instance, with its Address, its Actor's name, its State, its Model, its Props and its Children, and the app's Time. The only truth about the app's data. Init makes the first one from the root's Input, and one History entry after a Snapshot gives the next, purely: nothing runs. It holds data only: which Workers should run and which Children exist follow from it and the Definition, and how each Worker is doing is known only to the Runtime. Saved, every value in it is its Schema's encoded side, so that side must be JSON-safe; loaded, it is checked against the code as it is now, and one that no longer fits is refused. A Runtime is made from one, and a History starts from one.
_Avoid_: store, app state, actor system

### Data and change

**Model**:
The data an Actor keeps in every State. Always a struct and serializable, described with Schema. An Update gives only the fields that change. Every new Model, from init or an Update, is checked against its Schema, as is every State and Input; one that does not match changes nothing.
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
_Avoid_: event (XState's word; Kabuki uses Elm's names), action

**History entry**:
One Message as it is played: the Message, the Address it is sent to, its Source and its Time. What a Send makes, what gives the next Snapshot, and what a Runtime tells whoever subscribes. Kept in a History, it also has a number and the entry before it.
_Avoid_: envelope, event, packet, entry (on its own: the Router's Entry is another thing)

**Source**:
Who Sent a Message: the Instance, and what in it Sent: its View, a Command by its name, a Worker by its name and key, or what it Provides. The same Instance the Message goes to, except for a Message a Capability's function Sends to its Provider, which comes from the Instance whose Command or Worker called it, and an Emit, which comes from the Child that Emitted it, named by the tag of what it Emitted. A Message Sent from outside the tree, by a test, a tool or the server the app runs on, comes from outside, not from an Instance, named by whoever Sent it if it says. Kept with the History entry to show who talked to whom; Replay never reads it.
_Avoid_: sender, origin, caller

**Time**:
When a Message arrived, in milliseconds: from 0 at init, carried on from the Snapshot's Time when a Runtime is made from one or follows one, and standing still while it is stopped. Stamped by the Runtime and kept with the Message, and the Snapshot keeps the Time of the last one. Update reads it, so Replay gets the same answer as the running app. The one clock the app and its History share. It is how long things take inside the app, not a date: a moment in the world, a session that expires or a reminder at nine, is data a Message carries, and a Worker waits for it on the real clock, so it holds across a reload, a Fork and a server starting over. Update never reads the real clock itself, as it reads nothing but its arguments.
_Avoid_: timestamp, now, clock (on its own), date

**Update**:
The pure rule that takes the current Model, State and Props, a Message and its Time and returns the fields of the Model that change, the next State, the Commands it asks for and what it Emits. It never sees Capabilities, so Replay can run it with nothing else. Written under `on`, at the top or in a State's block; the State's rule wins over the top one, and a Message with no rule in either is ignored. A Message with no rule anywhere, at the top or in any State, is always ignored, and making its Actor warns of it. The only thing that changes the Model, so whatever is running is readable from it.
_Avoid_: reducer, handler

**Emit**:
What a Child tells its parent: a tagged value its Update returns under `emit`, checked against the `emits` its Shape names. The parent's slot for the Child turns each one into one of the parent's own Messages, given the Child's key, and the Runtime Sends it to the parent right after; it is in the History as its own entry, its Source the Child. One the slot does not turn is not heard, so a Child fits any parent. Between a parent and its own Child; what any Actor further down may need is a Capability.
_Avoid_: output, event, callback

**History**:
What happened to an app, kept beside it by whoever wants it: the Snapshot it starts from, a tree of History entries after it, one per Message, each pointing to the entry before it, and the Head the next one grows from. A Runtime knows no History: it tells whoever subscribes the entries it played, which are added to one, and a Snapshot read from a History is one a Runtime can follow. What came of a Message is worked out from the Snapshots before and after it. Replay needs only the start and the Messages on the way to an entry. Its entries are a plain list, so one Instance's are a filter by the Address they were sent to. Saved and given back, it is where an app carries on from, on a server, at build time, after a reload, or after its code changed. Keeps as much as its Window says.
_Avoid_: log, journal, event store

**Window**:
How many entries a History keeps on the Head's Branch, counted back from the Head: a hundred in a browser App. Keeping everything is a choice, never a default. Whoever keeps the History says it, and can change it at any time; a smaller one Compacts at once.
_Avoid_: limit, cap, retention, max size

**Compact**:
Fold every entry before the Window into the History's start: the start moves forward to the Snapshot right before the oldest entry kept, and the entries kept keep their numbers. What is not on its way to the Head and did not grow from there is gone, other Branches included. What the folded Messages did is kept only as that Snapshot, so code changed later never plays them again.
_Avoid_: prune, trim, truncate, garbage-collect

**Head**:
The History entry the next Message goes after: it moves to each new entry, and a Fork moves it to any earlier one, or to the start, so the next Message grows a new Branch.
_Avoid_: cursor, current, tip

**Branch**:
One line of entries from the History's start to an entry nothing has followed yet: a Fork to an earlier entry begins a new Branch beside the old one, which stays in the History. Time on a new Branch carries on from the entry it starts from.
_Avoid_: fork (as a noun for the line), timeline, run, session

**Replay**:
Rebuilding the app right after one History entry from the History's start and the Messages alone: each Message with its Time through Update, handed to the Instance at its Address. A Message for an Instance that is gone is dropped, as it was when it was Sent; Replay never Invokes an Instance the Messages did not. Props are worked out again from each parent. A Message that no longer fits its Actor's Schema is warned of and skipped. No Capabilities, Workers or Commands run.
_Avoid_: rehydrate, rebuild, preview

**Step**:
The app right after one History entry, or at the History's start: its Time and its Snapshot, and nothing else. What a Seek draws. Nothing between two Messages is a Step.
_Avoid_: index, tick, position, replay (the way a Step is made)

**Seek**:
Looking at any History entry, on any Branch, as a Step, while the Runtime stays where it is: running, or stopped. Nothing runs and nothing can be Sent to what it shows. Which entries a Seek can go to next is the History's to say: the one before, the ones that follow, and the last entry of every Branch.
_Avoid_: replay, rewind, go to

**Fork**:
Moving the History's Head to an earlier History entry, or to its start, and having the Runtime follow the Snapshot there, so the next Message grows a new Branch from it. No Command runs again: a Command belongs to the Message that asked for it, so work that must go on in a State is a Worker. Always the same Runtime; the old Branch stays in the History.
_Avoid_: rewind, restart, branch (the line it grows is the Branch)

**Time Travel**:
Drawing the app at a Step it Seeks: every Message up to it is played, and the app is drawn at that Message's Time. The Runtime stays where it is underneath, and nothing can be Sent from the past; going on from there is a Fork.
_Avoid_: undo, rewind, snapshot history, pause

### Work

**Command**:
An errand an Update asks for: made once, outside any Update, as a name, the Schema of its args and an Effect run from those args; an Update asks for it with its args. It ends with at most one Message, Sent to its Instance, and turns its own failures into that Message. Fire and forget: never in the History, never replayed. For work with nothing to show while it runs: replace the URL, tell a cache, call a Capability. It gets Capabilities from Effect. Nothing stops it but its Instance stopping; work that must be stopped, show progress, or survive a stop is a Worker.
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

**Query**:
A question an Instance answers from what it holds and what its Services know, without changing the Actor: declared in its Shape with what it is asked with and what it answers, each a Schema, and answered by a function in its Build, at the top or in a State, given its Instance's Model, State and Props and the Capabilities the Actor Requires, and returning an Effect with the answer or a typed failure. It never Sends; it may ask the outside world to answer. Written in a State, it exists only while that State lasts. Asked only from outside the tree, through a live Instance; a Parent, a View and a descendant never ask. Never in the History and never replayed; its args and its answer are checked against their Schemas. Asked of an Instance that has stopped, it fails rather than answers. When outside code needs work done and then a change, it asks a Query, then Sends.
_Avoid_: ask, probe, inquiry, request, RPC, call, getter

### Capabilities

**Capability**:
What an Actor can rely on from above, or offers to everything below it while in a State: a projection of its Model and State, functions that return Effects, or both. Built on an Effect service and identified by its key. A function on it may Send a Message to the Instance that Provides it, so a descendant asks an ancestor for a change without knowing where it is; it is called from a Command or a Worker, never from a View.
_Avoid_: service (for this), context, interface, dependency, input, output, request (for its functions)

**Requires**:
The Capabilities an Actor's own Workers, Commands and Provides may use, as a list: nothing else is in reach of its code. It is about the Actor alone, never its Children. What an Actor still needs from above is its Requires plus whatever its Children need that it does not Provide where they are placed; that need bubbles up until an ancestor Provides it, and the app's Layer covers the rest.
_Avoid_: inject, consume, depends on

**Provides**:
The Capabilities an Actor gives its descendants, each level naming the ones it gives beside the one Layer that builds them, which must build exactly those: one written at the top, one written in each State, or both. Only the Capabilities named reach the descendants, so its Blueprint knows them with nothing running. Written at the top, it is built once when the Instance starts and reaches the Children of every State; written in a State's block, it is built each time that State is entered, torn down when it is left, and reaches only that State's Children. It cancels out what the Children below it need. A Capability that follows the Model watches its Instance's changes itself. The nearest Provider wins. Most belong at the top; a State Provides only what can exist only in it.
_Avoid_: exposes, exports

**Service**:
The implementation behind a Capability that wraps an outside thing: a table, an agent process, a socket, a client. Kept by the Actor whose Provides or Workers use it. A Capability that is a projection of its Provider's own Model and State has no Service.
_Avoid_: adapter, client (as a kind), capability (for this)

### Routing

**Route**:
One typed place in the app, with its params and query: what a URL means once it is read, one tagged value per level. Every URL reads as exactly one Route, and a URL that names no place reads as the not-found Route rather than failing. Held once, by the Router, and handed down as Props.
_Avoid_: page, path, location, screen

**Router definition**:
The app's `router`: every Route of the app, read down from the root Page's Shape through the Pages under each, and how the Router behaves in the browser. The same definition makes each Route, reads a URL into a Route, writes a Route back as a URL, and says each place's Metadata, so none of them can disagree. Made from Shapes alone, so any Build may import it to move the app; it runs nothing, the Router Actor does.
_Avoid_: route table, route map, Routes (its old name)

**Page**:
An Actor with a place in the URL, with its own Model, States, Messages, Children and Workers. Its Shape says where it is, what it loads and the Shapes of the Pages under it; its Build says how it behaves and names the Build of each Page under it. One Actor: nothing is written around it. It takes no Input: it exists before its data, and is handed its params, its query and its data's Status as Props. The Pages under it are its Children, there while the URL names them.
_Avoid_: route component, screen, view (a Page's View is a View)

**Place**:
Where a Page sits in the Router definition, named by its keys from the root, dotted: `Blog.Post`. The Router holds the data of each place on screen under that name. Not an Actor: there is no Actor around a Page.
_Avoid_: route actor, wrapper, loader actor

**Status**:
Where a Page's data is: loading, failed, or ready with it, refreshing while it loads again behind what is shown, and when it goes stale. Ready also says whether the data waited: it took the place of a loading screen the Page drew, so a View may fade it in then alone; data that came while its Move was held, from a copy, or behind data shown did not wait. The Router hands it down to each Page as a Prop; a Page draws all three itself.
_Avoid_: loading state, pending, async state

**Router**:
The one Actor routing adds, above the root Page, made from the Router definition: it holds the app's history, as entries and where it is in them, holds a Move up to its delay, 150 ms unless said, while the Pages it brings load, and is sent every Move. A Page that is still loading when the Move lands shows it, and its loading screen stays at least the Router's minimum, 300 ms unless said, so it never flashes. Both are timed by its Workers and land as Messages, so a Replay draws them the same. It holds the data of every place on screen and loads it, and hands each Page its own as its Status, down through the Pages above it. The only thing in an app that knows about URLs.
_Avoid_: navigator, history (Kabuki's History is another thing), router (the Router definition)

**Data cache**:
The last data each place loaded, one copy per place and params, newest first, kept in the browser outside the Snapshot. A Move to a Page with a copy, Back, a link, or a Preload, shows it at once; a dynamic or client Page loads it again behind it once the copy is older than its Stale time. It holds a fixed number of copies, the least recently used dropped first, and never drops one for its age. The data a server drew the page with is kept in it too, as arrived when the server loaded it. Data reaches the app only in the Messages that bring it.
_Avoid_: back cache, query cache, store

**Stale time**:
How long a copy in the Data cache stays fresh after it arrives, said on a dynamic or client Page and inherited by the Pages under it, the Router's unless said, none unless the Router says. A fresh copy is shown and not loaded again, by a Move or a Preload alike; an older one is shown and loaded again behind it. A static Page's copy is fresh until the next deploy, and a Reload ignores it.
_Avoid_: max age, freshness, cache time, GC time

**Preload**:
A Message asking the Router to warm the Data cache, and load the code of the lazy Views, for a Route the app may move to: from a link on hover or once in view, or from an Update. Nothing comes back.
_Avoid_: prefetch

**Reload**:
Loading every Page on screen again, its data shown meanwhile, and dropping every other copy in the Data cache: after a save, or to retry a Page that failed. The Pages, their Models and States, stay. A Reload anew is for when what the data belongs to changed, as the signed-in account: the data shown is no one's any more, so it is never loaded behind, and every copy goes. The Router holds it as it holds a Move, the data shown until its delay at most, then each Page shows it is loading; a Move made meanwhile loads that data anew too.
_Avoid_: refresh (a browser's), invalidate, revalidate

**Navigation**:
The Capability the Router Provides to everything below it: functions to push a Route, replace it, go back or forward, Reload and Preload, each one Message to the Router, with its Source. Moving between Pages is a Child coming and going under a Page, never "a navigation".
_Avoid_: router (the Actor), history

**Move**:
The last change of the Router's current entry: where from, where to, and how, a load, push, replace, back or forward. What a Page's enter and exit animations read.
_Avoid_: transition (Kabuki's Transition is another thing), navigation

**Entry**:
One step of the Router's history: a Route, and the key the Router gives it, so Back and Forward land on an Entry it knows. A push makes a new one after the one shown; a replace makes a new one in its place, with a key of its own; a Reload keeps it.
_Avoid_: history entry (Kabuki's History is another thing), location, state

**Scroll restoration**:
Where the window and every element the user scrolled were, kept under the Entry they were scrolled on and put back when the app returns to it, as TanStack Router does: a new Entry starts at the top, what stays on the page keeps where it was, and a move can say to leave it all as it is. Kept outside the Snapshot.
_Avoid_: scroll memory, scroll area, scroll position

**Redirect**:
Going somewhere other than the URL asked for, in place of it, so Back never returns to it. Written in the Router definition for a URL that is never a place, for good; or said by a Loader, to a Route of the app or a URL outside it, for this visitor, and for good only if it says so. A URL that reads as a Route but is not how that Route is written is replaced the same way.
_Avoid_: guard, forward

**URL**:
Where the app is, as the live Router writes it into its Adapter: a Command per move, and nothing when the browser already shows it. Time Travel never touches it: a past Step is a drawing of the app, and the move that led there is one Message on the Timeline.
_Avoid_: location, address (an Instance's Address is another thing), sync

**Adapter**:
Where an app's URL lives: in memory, the default, so any app routes without touching a URL; in the browser's own history; or in TanStack Router's, for an app on a TanStack Start catch-all route. Given in the app's Layer; the Router definition and every Actor are the same whichever it is.
_Avoid_: backend, driver, host, mode

**Metadata**:
What a place says about itself to the browser and to search: its title, description and the tags that link and share it. Written on the Page, from its params and its data once there, so a server works it out before it draws; a View never writes it.
_Avoid_: head (the History's Head is another thing), meta, SEO, document

**Loader**:
How a place gets its data: one server function per Page that declares data, given its params and query, and the request unless the place is static. A Page that declares data and has no Loader is a type error. Loaders never wait on one another: a Page and the Pages under it load side by side. A Loader that fails says the place is not found, or Redirects; one that breaks fails its Page alone. Only Pages load: a part of a Page starts from its defaults or Props.
_Avoid_: fetcher, data function, middleware

**Render Mode**:
Where and when a Page's data is first loaded, said on the Page and inherited by the Pages under it: static, the same for everyone and drawn once until the next deploy; dynamic, loaded for each request; client, loaded in the browser alone, the server sending the Page loading. Only the first drawing differs: after it, every move happens in the browser.
_Avoid_: SSR, SSG, CSR, strategy

### Drawing

**View**:
How one Build is drawn: a React component that reads the Model, State, Props and current Children of one Instance, and can only Send. A parent's View hands it nothing but where to draw. A parent's View can also read its own Children's Model, State and Props, to draw them, but never Send to them. One function draws every State, so a Transition keeps the DOM, and an Instance that has stopped is drawn with its last data while it leaves the page. It never sees Capabilities, so it draws a Replay exactly like the live app. Kept apart from the Actor, so the same Actor can be drawn more than one way or not at all.
_Avoid_: render, template, component (on its own)

**Send**:
Hand a Message to an Instance: it is played at once, as one History entry. The only thing a View can do besides drawing; Workers and Commands can Send only to their own Instance. Code outside the tree can Send to any live Instance it reached through the Runtime, and learns what became of the Message: handled by a rule, ignored with none for it in that State, queued behind one being handled, or refused, the Instance gone, the Runtime stopped or the Message not matching its Schema.
_Avoid_: dispatch, emit, trigger

**Host**:
What the Runtime gives the Instances it runs: a way to Send to any Instance, the Time, and the Capabilities of the app's Layer. Only the Runtime holds a Host; an Instance's own Workers, Commands and Provides can Send only to it.
_Avoid_: self, context, environment

**Runtime**:
A Snapshot kept alive: what an app runs as, one per app. It holds the Snapshot and no other data, and runs the work that Snapshot asks for. It runs from the moment it is made, from a Snapshot or from the root's Input: every Message Sent gives the next Snapshot and is played at once, its Commands run, and the Workers and Provides the Snapshot asks for run. Handed a Snapshot, it Follows it. Stopped, all of that stops and a Send is refused; started again, the work starts from the Snapshot's data and no past Command runs. Made stopped, it runs nothing until it starts. It keeps no History: it tells whoever subscribes the entries it played. In a browser it is made when the app is first mounted and let go when the last drawing goes; on a server it can run with no drawing at all, for as long as the process lives.
_Avoid_: store, engine, interpreter, actor system, live, preview

**Follow**:
What a Runtime does with each new Snapshot, the one a Message gave or one handed to it: every live Instance is told its part of it, from the root down, and changes only what differs. An Instance whose part is the same as before is skipped with everything below it; new data reaches its code and starts and stops its Workers by their Conditions; a new State ends what the old one held and starts what the new one holds; a Child that is gone stops, and a new one starts. Work both Snapshots ask for is not touched. Asked to restart, all work stops and starts again from the Snapshot. A Snapshot handed in runs no Command.
_Avoid_: reconcile, sync, restore, jump

**App**:
An Actor tree with its Layer, made into one React component: it makes one Runtime for every mount, keeps the app's History beside it, and draws the Runtime's Snapshot, or the Step it Seeks. Each View draws its Instance from that Snapshot; a Send from a Step is dropped.
_Avoid_: stage, root, provider

**Attachment**:
A function Kabuki calls with each App's running Runtime when it starts in a browser, which returns how to stop it; Kabuki calls that when the Runtime stops, at the last unmount or a hot reload. Given through the `attach` option, it is how something outside the app, such as a devtool, runs beside it without Kabuki knowing what it is.
_Avoid_: plugin, hook, extension

### Serving

**Start**:
What serves an app's first drawing: for a URL, it reads the Route, runs the Loaders, starts every page from its Input and draws the result in the Document, with the Snapshot beside it, so the browser carries on from it. Never runs a Runtime: what it draws is pure. Serves the Loaders to the browser for every move after.
_Avoid_: framework, server, SSR

**Document**:
The page's HTML around the app, written once: where Start puts the Metadata, the styles and the scripts, and where code that must run before the first paint is written inline. Given no data, so it is the same for every Render Mode.
_Avoid_: shell, layout, root, html

**App Shell**:
The Document with no app drawn in it, the same for everyone until the next deploy: it shows what `Start.app({ loading })` says until the browser has drawn the app in it at its own URL, every place loading. What something in front of the app, such as a service worker, answers a page with; under a client root, it is what the server answers every URL with.
_Avoid_: shell page, skeleton, empty page

**Pages**:
What Start tells anything in front of the app about it: every Page with its path, whether its path has params, and how its first drawing is made, static, dynamic or client, worked out from the Render Modes of the places on its path; and where the App Shell is. Served by Start, from the Routes, so it cannot disagree with them.
_Avoid_: sitemap, route manifest, page list

### Seeing the app

**Timeline**:
The Inspector's bar for picking the Step shown: every Step on the Branch in view, in order. With Travel the app on, as it is at first, picking a Step Time Travels the app too, and a Fork carries on from it on a new Branch; off, only the Inspector looks back while the app runs on. Going to the Head shows it again.
_Avoid_: history, message list, scrubber

**Branch in view**:
The one Branch the Timeline and the Inspector walk, from the History's start to its latest entry: the Head's, until another is picked. A Step before a split is on every Branch that grows from it, so picking it keeps the Branch in view.
_Avoid_: selected branch, active branch

**Inspector**:
The one way to look inside the app: the Snapshot at the Step shown, every Instance a card on a canvas to pan and zoom, joined to its parent by a line that says its Condition, with the Timeline under it. A card opens to its States, Workers, the Messages it handles, its Children, Model, Props and Capabilities, and as many open at once as the reader likes. The Step is compared with the one before it: what it added, changed or took away is marked where it is and on the card that holds it, and the card its Message was for names the Message. A Capability picked shows who provides it and every card that uses it. Laid out by its own width, the same full screen, in a side panel or on a phone; a Story can be told on it.
_Avoid_: devtools (the repo's DevTools is another thing), debugger, panel, stage

**Story**:
An answer told on the Inspector, one Scene at a time, as data an agent writes: each Scene names a moment of the History, the card it is about and one part of it, and says one thing about it, and the Inspector lights that part and dims the rest. It plays on the app's own History, or on a saved one it carries, the same every time.
_Avoid_: tour, walkthrough, scene list

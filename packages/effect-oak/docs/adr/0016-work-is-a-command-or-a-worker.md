# Work is a Command or a Worker, and a Worker is owned by a Condition

There are two kinds of work and no third. A Command is Elm's: one named Effect an Update asks for, ending with at most one Message, for work with nothing to show while it runs. A Worker is a named, scoped Effect that runs for exactly as long as its Condition holds, Sends any number of Messages, and is the only ongoing work. A Condition is read from the Instance's own Model and State after every Update: the Instance, one State, a yes or no, or a list of keys with one Worker per key. Nothing stops work but its Condition, so stopping is changing the Model, and there is no cancel. This supersedes [ADR 0011](0011-lifetimes-and-commands-are-scoped-effects-that-send.md), which let a Command Send many Messages and be interrupted by key, and renames Lifetime to Worker.

The reason is one rule: effects are data, and what is running is a function of the Model. Everything the screen shows while work runs is already in the Model (`uploading`, `tab`, a status per row), so that line can own the work for free. Owning work by a handle instead, as keyed Commands did, kept two truths that had to be held together by hand: every demo paired a Model change with a `cancel`, and guarded late results against a Model that had moved on. With a Condition, the Scope closes before the next Message is handled, so a late result cannot land, and the Inspector can tell which Workers a Step expects from the Snapshot alone, on any Branch.

## Considered Options

- **A third kind, started by a Message, Sending progress, ending by itself, stopped by key (Invoke)**: rejected. It is ADR 0011's Command under another name, and brings back cancel, the stale guard and the second truth. An upload with progress is a Worker on the row's status; the upload ending is the Message that takes the row off the Condition.
- **Model-keyed work only as keyed Child Actors, no `while` or `each`**: rejected. A Worker keyed on the Model is a keyed Child with one State, one Worker and no View, but a Child can only Send to itself, so telling its parent "tick" costs a Capability and a Request. The short forms are the same diff underneath and tell the reader and the Inspector what kind of thing it is.
- **Restart a Worker when the data it read changes, as Foldkit's Subscription does**: rejected. The key decides existence; anything else is read live through `self`. Restart on change is what Foldkit's `keepAliveEquivalence` exists to undo.
- **Let the runtime remove a finished Worker's key**: rejected. The runtime never writes the Model. A Worker that ends on its own ends with a Message whose Update takes its key off the Condition; a key that stays leaves a finished Worker idle, which the Inspector shows.
- **Keep Commands unnamed**: rejected. A name costs nothing, gives every Message in the Log a sender, and lets a test answer a Command by name, which ADR 0011 left open.

## Consequences

- `key` and `cancel` leave Command, and `self` with it: a Command is `Effect<Msg | void>`. An Update may ask for several Commands; they run concurrently.
- The upload, field check and toast demos lose their keys, cancels and stale guards.
- The ladder is Command, then Worker, then Actor: a Command when nothing is shown while it runs, a Worker when something is, an Actor when the thing has States, a View or Children of its own.
- A Worker must start from the Model alone, because a resume or a start from an earlier Log entry starts every Worker whose Condition holds. An upload at 40% starts over, or resumes from what the row says.
- A Finalizer never Sends. Each Worker's `self` is closed as its Scope closes, and a Send after that dies loudly, which also catches a fiber that outlived its Worker.
- A Worker that fails with a defect is logged and stays dead while its key stays; it is not restarted, and the Inspector marks it. Worker status (running, finished, failed) is live only, never in the Snapshot or the Log.
- Change gains the Workers a Step started and stopped; Source names the Command or the Worker and key that Sent a Message.

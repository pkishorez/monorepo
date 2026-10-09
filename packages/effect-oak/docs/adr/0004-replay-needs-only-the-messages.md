# Replay needs only the Messages: Update and Views never see Services

Time Travel replays the Messages into a fresh tree: init, then each Message through Update, handed to the Instance with its number. Instances are numbered as their tree creates them, which replaying repeats, so a Message for an Instance that is gone is dropped again even if a new one sits at its Path. Nothing else runs. For that to work with no Services at all, Update, init and Views never see Services. Commands and Lifetimes get them from Effect (`yield* Session`), so an Update can build a Command without touching a Service, and replay simply drops it. Only `provides`, which runs in the live Runtime alone, reads Service values. The pure tree is shared: the live Runtime grows it with Hooks that Provide, run Lifetimes and Commands; Replay grows it with none.

## Considered Options

- **Snapshot history per Node**: rejected. It duplicates what the Log already says, and every Node pays for it on every change.
- **Replay with stubbed Services**: rejected. Any Update or View reading a stub could crash or draw something that never happened.
- **A separate replay engine**: rejected. Two copies of how a tree grows would drift apart.
- **Addressing Messages by Path**: rejected. A new Instance at the same Path would receive Messages meant for one that is gone.

## Consequences

- A View that asks an ancestor for something Sends its own Node a Message whose Update returns a Command making the Request. The click is in the Log.
- Scrubbing forward plays only the new Messages; scrubbing back replays from the start.
- The Log keeps what came of each Message and when, for reading. Replay never reads it.

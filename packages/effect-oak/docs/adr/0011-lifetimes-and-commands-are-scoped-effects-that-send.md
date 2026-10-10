# Lifetimes and Commands are scoped Effects that Send; init has no Commands

A Lifetime is a scoped Effect that runs for as long as its Instance exists (`'*'`) or is in one State, can Send its Instance any number of Messages, and reads the Instance's current Model and State at any time. A Command is the same kind of Effect, started by an Update instead of by entering a State: it may Send any number of Messages, and it is owned by its Instance, running until it ends, the Instance stops, or a Command started under the same key replaces it. init only sets the first Model and State; work on start is a Lifetime.

## Considered Options

- **A Command ends with exactly one Message, as in Elm and Foldkit**: rejected. Foldkit's reasons are its tests (`Command.resolve(Cmd, Msg)`) and devtools recording one result per Command, not Replay: every Message is in the Log however it was sent. A streamed response is one Command sending a Message per chunk.
- **Commands owned by the State they started in**: rejected. A Command whose first Message causes a Transition (Waiting → Streaming) would interrupt itself. Cancelling is a key instead.
- **Lifetimes as Streams of Messages**: rejected. A scoped Effect with Send can open a resource, run a loop, or do both, and its Scope closes it.
- **Commands from init**: rejected. They ran once on a fresh start and never on a resume or a fork; a Lifetime runs every time the Instance goes live.

## Consequences

- Commands have no names yet, so a test cannot resolve one by name. To be revisited.
- Whether a Command can be tied to a State is left open.

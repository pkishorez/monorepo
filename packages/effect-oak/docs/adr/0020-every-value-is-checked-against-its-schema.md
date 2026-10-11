# Every value is checked against its Schema, in production too

Every value an Actor's Schemas describe is checked as it is made, in every build:

- each Message as it is Sent, from a View, a Command, a Worker or a Request, before it reaches the mailbox;
- each Input as an Instance is created, and the Model and State its init gives;
- each new Model and State an Update gives.

A value that does not match throws a `TypeError` naming the Actor, what the value is, and the field, and nothing changes: no Update is applied, no Log entry is written. `make` takes codecs that need no Capabilities, so every check runs at once, inside the synchronous Send of [ADR 0010](0010-handling-a-message-is-synchronous.md).

## Considered Options

- **Types only (until now)**: rejected. A cast, plain JavaScript or data from outside the code can put a value in the Snapshot or the Log that the Actor never declared, and Update and Replay then run on it.
- **Checking only in development**: rejected. The bad value that matters is the one production sees.
- **Checking Messages only**: rejected for now, for correctness first. Checking the Model costs time in proportion to its size on every Update that changes it; if that shows, it is the first check to turn off.
- **Recording a refused Message in the Log, as with a dropped one**: rejected. A value that is not one of the Actor's is not a fact about the app, and a throw points at the code that made it.

## Consequences

- A Message is checked as it is Sent, so its error is thrown in the code that Sent it. Checking it when handled would blame whichever Send was draining the mailbox.
- A bad Model or State from an Update is found when the Message is handled. The Message is not recorded, the rest of the mailbox is still handled, and the Send that drained it throws, naming the Update by its Message and State.
- Replay checks Inputs, Models and States again, because they are made again; Messages in the Log are not checked again.
- An Update that gives back the Model or State it was handed is not checked again.
- A Command or Worker that Sends a bad Message dies, and its failure is reported like any other.

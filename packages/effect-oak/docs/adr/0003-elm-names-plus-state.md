# Elm's names, plus State

Effect Oak uses Elm's names for its parts: Model, Message, Update, Command, View. It adds one word from statecharts, State, for which of a Node's exclusive situations it is in, because Elm has none. The Model is the data kept in every State.

## Considered Options

- **XState's names (context, event, actions)**: rejected. `Context` already means Services in Effect, and the architecture is Elm's: Update returns the next data plus Commands, and Views Send Messages into a Log.
- **Model as all of a Node's data, with the always-kept part called Shared**: rejected. "Shared" reads as shared with other Nodes.

## Consequences

- Update, Lifetimes and Views read `{ model, state, services }`.
- Lifetime keeps its own name instead of Elm's Subscription: it is anything that runs while a State lasts, not only listening.

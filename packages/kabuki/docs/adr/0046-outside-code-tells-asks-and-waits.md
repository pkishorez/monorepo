# Outside code tells, asks and waits

Amends [ADR 0038](0038-code-outside-the-tree-reaches-live-instances.md) and [ADR 0043](0043-a-query-answers-from-outside-without-changing-the-tree.md). On a server an app is reached, not drawn, and outside code had three doors, each looser than the rest of Kabuki: `send` said only whether a Message arrived, so a Message ignored in the wrong State looked like one handled; a Query's args were whatever its `run` was annotated with and its answer was never named, so nothing but its code said what it took or gave; and waiting for what a Message started meant filtering `changes` by hand. A request and its answer cannot be a Message with a reply, since a reply is a live channel and the History keeps only facts. So outside code gets three doors, each typed and each kept apart.

**Tell**: `send` says what became of the Message, `'handled' | 'ignored' | 'queued' | 'refused'`, from what the engine already knew: handled by a rule, ignored with none for it in that State, queued behind a Message being handled, or refused, the Instance gone or the Message not matching its Schema. **Ask**: a Query is declared in the Definition, `queries: { peers: { args: { room: Schema.String }, result: Schema.Array(Schema.String) } }`, beside the Messages, and answered in the Build by a function, `queries: { peers: (self, { room }) => Effect }`, as a rule is under `on`. Its args are checked as it is asked and its answer before it is returned, and a Query answered but not declared does not compile. The Definition is the Actor's whole surface: what it holds, hears, tells its parent and answers, and a devtool reads every Query's args and answer from it. **Wait**: `until(test)` answers with the Instance once its data passes the test, read now and after every Message, narrowed as the test narrows it, or fails with `Stopped` if the Instance stops first. Its answer is read from data the History keeps, so it stays deterministic.

Work outside the tree that ends in a change is asked, then told: the engine asks a Session for a new title, then Sends it `Titled`. Reading an Instance's Model, State and Children stays open to any outside code, as introspection.

## Considered Options

- **A Message with a reply**: rejected again, as in ADR 0043.
- **Imperative tasks on an Instance, started from outside, reporting progress and a value**: rejected. Work started by an event and not derived from the Snapshot is lost on a reload, a hot reload, a Time Travel start and a hydration, while the Model still says it runs. Work that must outlive those is a Worker, whose Condition the Model holds.
- **Commands that outside code runs on an Instance**: rejected. It would make the Definition no longer the list of what an Instance answers.
- **Query Schemas beside the answer in the Build**: rejected. The surface would be split between the Definition and the Build, and a tool reading the Definition would miss it.
- **An `error` Schema for a Query**: left out. Its failures stay typed by its answer's Effect until a tool needs them named.
- **The untyped `running.query(id, name, args)`**: removed. The live Instance's `queries` is the one way to ask.

## Consequences

- A Query takes one args value or none: `fork(afterTurnId)`, `ask({ question, schema })`, `retitle()`.
- A Query's Schemas are not encoded, as nothing saves them, so a `Float32Array` is an arg as it is.
- `send` returning a string, code that tested it as a boolean must compare it; none in the repo did.
- `Stopped` names a `query` only when a Query was asked.

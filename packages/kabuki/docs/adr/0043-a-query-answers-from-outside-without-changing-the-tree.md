# A Query answers from outside without changing the tree

On a server an app is reached, not drawn ([ADR 0038](0038-code-outside-the-tree-reaches-live-instances.md)), and what outside code can learn of an Instance is its Model, State, Props and Workers. That leaves out what only the Instance's Services know: an agent process's MCP status or context usage, a socket's peers, a table's row count. ai-toolkit answered this with a registry beside the tree, its Desks, keyed by session id, into which each Session Actor's Worker put its agent, so the engine could reach the agent by a second lookup and wait up to five seconds for it. A Query puts that knowledge back on the Instance. It is a named function written in the Build, at the top or in a State's block, as a Worker is: `queries: { name: { run: (self, args) => Effect } }`. It gets a Worker's `Self` without `send`, and the Capabilities the Actor Requires, provided by Kabuki from the Instance's own Layer. It may read the Instance and ask its Services, and never Sends, never changes the Model and never changes the world. Outside code asks it through the live Instance, `instance.queries.name(args)`, and gets an `Effect` whose failure adds `Stopped`, raised when the Instance has stopped or left the State before or during the Query, and whose requirements are `never`. Written in a State, it is on the live Instance's type only once `_tag` has narrowed to that State, as the State's Children are, so nothing is asked of a State the Instance is not in.

## Considered Options

- **A registry beside the tree**, as ai-toolkit's Desks had for this: rejected. It is a second tree keyed by the same identity the Instance IDs already carry, it hangs on an Instance that never registers, and nothing types what it holds against the State the Instance is in.
- **A Message with a reply**: rejected. A Message is a fact that changes the Model, is in the History and is replayed; a question is none of those, and a reply channel in the Envelope would have to be stripped on save.
- **A Query that may act on the world** (stop a job, close a socket): rejected. Asking twice with nothing in between must answer the same; acting is a Command's job, asked for by an Update, so the Model records that it happened. `stopBackgroundJob` becomes a Message whose Command tells the harness.
- **A Query that opens what it asks**: rejected for the same reason. Spawning an agent process to answer "what is your status" is a hidden world change; a Query answers from what is open and fails otherwise.
- **Queries on the Capability, for descendants**: rejected. A descendant gets what it needs as Props or Capabilities; letting it interrogate an ancestor's Service couples it to where that ancestor is.
- **A parent or a View that asks**: rejected. A View can only Send, so a Replay draws the same picture; a parent controls its Children only through data ([ADR 0027](0027-a-parent-controls-its-children-only-through-data.md)).
- **`while` and `each` on a Query**: rejected. A Query is not running, so nothing owns it; State is its only scope, and a part of a State where it is askable wants to be a State of its own.
- **Schemas on args and answer**: rejected. Nothing is saved or replayed, so a check buys nothing; the server's own boundary has its schema.
- **Ordering through the Mailbox**: rejected. A Query reads the current Snapshot and asks a Service whose answer the Mailbox cannot order anyway; a caller who wants "after my Send" Sends, then asks.

## Consequences

- ai-toolkit's engine no longer reaches a Session's agent through its Desk: `mcpStatus` and `contextUsage` are Queries of the Session, answered while the agent is open and failing as `AgentClosed` otherwise, with no timeout. The Desk stays for what has an answer and does something, a Fork, a new Title, an Ask, and for the Session's own Workers, which share the agent through it.
- A Query runs in the Scope of its Instance or its State, as a Worker does, so leaving the State interrupts it and the caller gets `Stopped`.
- A Query does not see Worker status; the caller reads `workers` on the same live Instance and composes.
- The Inspector does not draw Queries: they are not in the Snapshot and make no Step.
- A Query name written both at the top and in a State is an error when the Actor is made, as a duplicate Worker is.
- A Query's answer and failure types are inferred from its `run`, so the Actor's type carries its Queries per State as it carries its Children, and the live Instance's `queries` narrows with `_tag`.
- The Query's Effect gets the Actor's Requires only; a Query that needs more names it in Requires, which bubbles up as any other need does ([ADR 0017](0017-behavior-is-written-in-levels-and-needs-bubble-up.md)).

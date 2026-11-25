# An Instance tries a Message without sending it

Amends [ADR 0046](0046-outside-code-tells-asks-and-waits.md). A devtool or an agent driving an app from outside wants to know what it can do before it does it: which Messages an Instance takes now, what each is about, and what one would change. Kabuki already held all of that but the last. The Blueprint names each level's Messages with their Schemas, the Snapshot says which State each Instance is in, and Next is pure. So nothing new is declared: an Actor's Shape gains a `description`, a Message is described with Schema's own `description` annotation, on a case written as a `Schema.Struct` of its fields, `Blueprint.handles(blueprint, state)` lists the Messages a State takes, and the live Instance gains a fourth door, **Try**.

`instance.try(message)` plays the Message through Next on the current Snapshot, at the Time a Send now would get, and keeps nothing. It answers one of five cases, `Tried`: `InstanceNotFound` once the Instance is gone from the tree; `Refused`, with the `reason`, when the Message does not match its Schema or its Update gives what its Schemas refuse, as a Send would be refused; `Unhandled`, with the State it is in and the States in `handledIn` that have a rule for it; `NoChange`, when a rule runs and changes nothing, asks for nothing and Emits nothing; or `Changes`: the `snapshot` after it, the `model` fields of the Instance that change, the `commands` asked for as `{ name, args }`, and the `emits` the Update gave, whether its parent hears them or not.

## Considered Options

- **Actions declared beside the Messages**, which an outside tool may Send, each with its fields narrowed by the data (a choice of the ids the Model holds): rejected. It is a second list of what an Instance hears, kept in step with `on` by hand. The Blueprint already says which Messages a State handles, and a try says whether a given one does anything, which is the narrowing, after the fact and always right.
- **A summary type for agents, made by Kabuki**: rejected. The Blueprint and the Snapshot are the summary; text for an agent is printed from them by a tool, which can change without changing Kabuki.
- **A diff of the whole tree in `Changes`**: left out. The Snapshot after is given whole, and whoever shows it compares it as suits it; the Instance's own Model fields are given because they are what is asked most.
- **Following an Emit into the parent's Update**: left out. The parent's change is a second Message, which the caller can try in turn.
- **Describing a Message only in a union written whole**, `Schema.Union([Schema.TaggedStruct('Hear', { … }).annotate({ description })])`: rejected. Nearly every Actor writes its cases as fields, and would have to give that up to describe one. A case may be a `Schema.Struct` of its fields instead, `Hear: Schema.Struct({ text }).annotate({ description })`: Kabuki tags it with its key and keeps its annotations and checks.
- **A `description` key beside the fields of a case**: rejected. It would be a field name Kabuki takes from every Message, where Schema already has a place for it.

## Consequences

- A case of a State, Message or Emit may be a `Schema.Struct`; any other Schema there is refused when the Actor is defined.
- `Played`, what Next gives, carries the `emits` the Update gave beside the parent's Messages they became.
- The Runtime tells reaching its Time, so a try is stamped as a Send now would be.
- A try works while the Runtime is stopped: it reads only the Snapshot.

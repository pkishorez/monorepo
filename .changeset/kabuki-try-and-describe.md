---
'@kestack/kabuki': patch
---

An Actor says what it is about, and outside code can ask what a Message would do before Sending it. `Actor.define` takes a `description`, which its Blueprint carries. A case of a State, Message or Emit may be written as a `Schema.Struct` of its fields, tagged with its key and keeping its annotations and checks, so a Message is described with Schema's `description` annotation: `Toggled: Schema.Struct({ id }).annotate({ description })`. `Blueprint.handles(blueprint, state)` lists the Messages an Actor has a rule for in a State. `instance.try(message)` works out what the Message would do from the Snapshot alone, with nothing Sent: `InstanceNotFound`, `Refused` with the reason, `Unhandled` with the States that handle it, `NoChange`, or `Changes` with the Snapshot after, the Model fields that change, the Commands asked for and what it Emits.

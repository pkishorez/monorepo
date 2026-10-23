---
'@kestack/kabuki': patch
---

Queries: a question code outside the tree asks a live Instance, answered from what it holds and what its Services know, changing nothing. Written in the Build as `queries: { name: { run: (self, args) => Effect } }`, at the top or in a State's block; `self` is a Worker's without `send`, and the Effect runs with the Actor's Requires, supplied by the Instance. Asked as `instance.queries.name(args)` on a `LiveInstance`, typed: a State's Queries are on the type only once `_tag` has narrowed to it, each with its own args, answer and failure, plus `Stopped` for an Instance that has stopped or left the State before or while answering. A Query name written twice is an error when the Actor is made.

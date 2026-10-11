---
name: grill-with-oak
description: A relentless interview that turns a requirement into an Effect Oak tree of Actors, leaves first, then builds it in the Actor folder layout.
disable-model-invocation: true
---

# grill-with-oak

Run a `/grilling` session, using the `/domain-modeling` skill, with the stages
below. The grilling rules hold throughout: numbered questions, each with a
recommended answer, one round at a time, and nothing settled silently.

Before the first question, read `packages/effect-oak/CONTEXT.md` and
`packages/effect-oak/README.md`. The glossary's words (Actor, Model, State,
Message, Update, Transition, Command, Worker, Condition, Capability, Requires,
Provides, Child, Input, Invoke, View, Frame) are the vocabulary of every
question; the app's own words (what the Actors are called) go in the app's
`CONTEXT.md` as they are resolved. Read `/laymos` as well: the tree is built
as Nested Modules, and [LAYOUT.md](LAYOUT.md) says how.

## Stage 0: the requirement

Ask every requirement question whose answer could change which Actors exist or
what one of them does. Done when a round comes back with no requirement
question left to ask; only then do modeling questions begin.

## Stage 1: the tree

Ask one question: the whole tree of Actors as you propose it, drawn as nested
names with one line each saying what it is, which are keyed Children, and the
root. Give the recommendation and wait. Repeat with the amended tree until the
user accepts it as drawn. Done when the tree is accepted: every Actor named,
its parent known, and the root chosen.

## Stage 2: one round per Actor, leaves first

Walk the accepted tree in post-order: every Child before its parent, siblings
in the order they appear in the tree, the root last. One round per Actor, with
every question for that Actor numbered in this order, each with a
recommendation:

1. **Input**: what the parent hands it when Invoked (Children only).
2. **Model**: the data it keeps in every State.
3. **States**: the exclusive situations, and the data that only exists in each.
4. **Messages**: every fact that can reach it, named in the past tense.
5. **Updates and Transitions**: what each Message does in each State, and
   which ones change State.
6. **Commands**: the errands an Update asks for, each ending in at most one
   Message.
7. **Workers and Conditions**: the work that runs for as long as a Condition
   holds, at which Level, and what each Sends.
8. **Requires**: the Capabilities its own code needs from above, with a
   Request for each change it must ask an ancestor for.
9. **Provides** (parents): which of its Children's needs it answers, at which
   Level, and which bubble up.
10. **Invoke** (parents): which Children each Level Invokes, the keys for
    keyed Children, and the Input each starts from.
11. **View**: what it draws in each State, the data props its parent hands
    it, and what moves between Messages from the Frame.

A Child's round settles its Requires; the parent's round decides Provides or
bubble. Done with an Actor when every item above has an answer the user
accepted. Done with the stage when the root's round is accepted and nothing
the tree needs is left unassigned: every Requires is either Provided by an
ancestor or named as the app Layer's.

## Stage 3: the plan

Write one numbered plan in chat: the folders and files per Actor from
[LAYOUT.md](LAYOUT.md), the `capabilities/` Modules and the Laymos Rules they
need, the app Layer, and the order of building (leaves first). Wait for go.

## Stage 4: build

Build on go, in the same session, leaves first. Follow [LAYOUT.md](LAYOUT.md)
exactly. Write the Rules into the app's `laymos.config.json`, creating it when
absent. Done when the tree compiles, `toReact` is given a Layer that covers
every bubbled need, and `laymos lint` reports no violation. Stories and Proofs
are out of scope.

# Writing Stories

A Story teaches one idea to one Reader. Its Telling is the `story.md` in the
Story's folder; its Proofs are the `*.proof.ts` files beside it. These rules
apply to both.

## Know your Reader

The Reader is whoever uses the idea this Story is about, and the Reader
changes as you go down the tree.

- The top Story of a toolkit speaks to someone deciding whether to use it.
  They don't know the API yet. Sell them the outcome.
- A Story about one part speaks to someone already using that part. They know
  the toolkit; they want to know what this part does for them and where its
  edges are.

Before writing, finish this sentence: "You are someone who wants to …". If you
can't, the Story has no Reader.

## Shape of a Telling

```md
# Evolving schema

Change your data's shape whenever you like; rows written years ago still read correctly.

Your app's data outlives its first design. …

First you [describe a shape](std-toolkit/evolving-schema/shapes), then …
```

- **Title**: the `#` heading. The name the Reader will meet in the API or the
  docs, short enough for a card: "Evolving schema", "Sync", "Shortcuts".
- **Pitch**: the first paragraph. One sentence, about 20 words at most, said
  to "you", stating what you get. It is all a closed card shows, so it must
  stand on its own.
- **Body**: everything after the pitch, under about 200 words:
  1. the problem, as the Reader feels it;
  2. what you do, with at most one short snippet of code _the Reader_ writes;
  3. what you get;
  4. how the parts fit together, naming each sub-Story by link.

## Name every part where it fits

A sub-Story exists because its parent needs it. Link it in the sentence that
says why:

> Every change to a shape becomes a [migration](std-toolkit/evolving-schema/migrations)
> that runs as old rows are read, so nothing has to be rewritten up front.

- A link target is an absolute Story id or Proof id in the same Project:
  `std-toolkit/evolving-schema/migrations`.
- The order you first link the parts is the order they are shown. Introduce
  them in the order a Reader should meet them.
- A sub-Story you never link is an error, and so is a link to nothing.
- Link a Proof when the prose makes a promise the Proof backs:
  "[old rows still read](std-toolkit/evolving-schema/old-rows-still-read)".

## Voice

- Conversational, second person: "you write", "your rows".
- The Reader's side only: what they want and what they get. Never how it is
  built: no internal module names, no "under the hood".
- Plain words. Say "save" before "persist", "rows from older versions" before
  "legacy records".
- No marketing filler ("powerful", "seamless", "robust"). A concrete promise
  beats an adjective.
- Short paragraphs. No headings inside a Telling; the tree is the structure.

## Proof titles

A Proof title is a claim the Reader would care about, written as a plain
sentence in the present tense:

- ✓ "A row written by version 1 reads as version 3"
- ✓ "Closing the leader tab hands sync to another tab"
- ✗ "decode applies migrations"
- ✗ "leader election test"

The optional `description` adds the one detail the title leaves out, such as
why this edge case matters. The top Story's Proofs are end-to-end: they show
the parts working together the way the pitch promised.

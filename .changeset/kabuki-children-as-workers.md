---
'@kestack/kabuki': patch
'@kestack/web-platform': patch
---

A Child is written as a Worker is: `children: { rows: { actor: Row, each: ({ model }) => model.ids, input: (_, id) => …, props: ({ model }, id) => … } }`. `invoke` and `Actor.many` are gone: a Child is always there, there `while` a test holds, or one per key `each` names, and its `input` and `props` take the parent's data and its key. A `while` Child is new, and comes back as a fresh Instance; a parent's View types it as a Handle or `undefined`. An outlet's `children` now carries everything, so `invoke: outlet.invoke` is dropped and the outlet is spread beside the Actor's own Children.

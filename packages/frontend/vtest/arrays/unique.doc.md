---
title: unique
---

# unique

Removes duplicate elements, preserving the order of the first occurrence
of each.

```ts
unique([1, 2, 1, 3, 2]);   // [1, 2, 3]
unique(['a', 'A', 'a']);   // ['a', 'A']
```

A second-argument key function turns it into a *first-wins* deduplicator
keyed by anything you like — useful for collapsing objects by `id`.

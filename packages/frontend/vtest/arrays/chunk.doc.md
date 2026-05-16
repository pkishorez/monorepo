---
title: chunk
---

# chunk

Splits an array into fixed-size sub-arrays. The last chunk may be shorter
than `size`.

```ts
chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
chunk([], 3);              // []
```

> **Invariant.** `chunk(xs, n).flat().length === xs.length`. Verified by
> the *no item loss* test below.

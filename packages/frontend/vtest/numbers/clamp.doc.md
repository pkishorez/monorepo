---
title: clamp
---

# clamp

Constrains a number to a closed interval `[min, max]`.

```ts
clamp(5, 0, 10);    // 5
clamp(-1, 0, 10);   // 0
clamp(99, 0, 10);   // 10
```

`NaN` propagates: `clamp(NaN, 0, 1)` returns `NaN`, matching the behaviour
of `Math.min` / `Math.max`.

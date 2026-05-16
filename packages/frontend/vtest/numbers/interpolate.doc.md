---
title: interpolate
---

# interpolate

Linear interpolation between two scalars by a parameter `t ∈ [0, 1]`.

```ts
lerp(0, 100, 0.25); // 25
lerp(10, 20, 0.5);  // 15
```

The implementation uses the **monotonic** form `a + (b - a) * t` rather than
`a * (1 - t) + b * t`. The monotonic form guarantees `lerp(a, b, 0) === a`
and `lerp(a, b, 1) === b` exactly, even with floating-point rounding —
which the other form does not.

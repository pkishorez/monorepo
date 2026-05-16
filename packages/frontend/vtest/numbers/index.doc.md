# Numbers

Numeric primitives for clamping, mapping, and interpolating values across
ranges. Everything is total — every input has a defined output, including
the awkward ones (`NaN`, `±Infinity`, inverted bounds).

## Modules

| Module        | Role                                                 |
| ------------- | ---------------------------------------------------- |
| `clamp`       | Constrain a number to a closed interval `[min, max]` |
| `interpolate` | Linear interpolation between two values              |

## Conventions

- **`NaN` propagates.** Matching `Math.min` / `Math.max`, any helper
  receiving `NaN` returns `NaN` rather than silently coercing.
- **Bounds are not validated.** Inverted intervals (`min > max`) are the
  caller's mistake; the helpers document their behaviour but do not
  throw. This keeps the hot path branch-free.
- **No locale or formatting concerns.** Pure numeric in/out — string
  formatting belongs in `strings/` or a dedicated `Intl` wrapper.

> Each module's tests cover the canonical case, the boundary cases (at
> `min`, at `max`, and `NaN`), and at least one degenerate input.

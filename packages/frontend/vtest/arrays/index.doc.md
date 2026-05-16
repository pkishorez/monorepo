# Arrays

Small, allocation-conscious helpers that take an array and return a new
array. Everything here is **pure** — no in-place mutation — and works on
both arrays and array-like iterables where possible.

## Modules

| Module   | Role                                                      |
| -------- | --------------------------------------------------------- |
| `chunk`  | Split into fixed-size sub-arrays; last chunk may be short |
| `unique` | Remove duplicates preserving first-seen order             |

## Conventions

- **Input is never mutated.** Every helper returns a fresh array; this is
  the property that lets these compose safely in pipelines.
- **Order is preserved** unless the helper's name says otherwise. `unique`
  keeps the first occurrence; nothing here re-sorts.
- **Empty input is a valid input.** Each module's `empty / edge` suite
  pins down the empty-array contract so callers don't need their own
  guard.

> If you find yourself reaching for `lodash` for a one-liner, check here
> first — most array helpers we use live here and have tests next to the
> docs that prove the behaviour.

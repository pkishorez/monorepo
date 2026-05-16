---
title: partition
order: 2
---

# partition

A **partition key** is a small record of `string → string` pairs that
scopes a set of cached entities (e.g. `{ tenant: 'acme', region: 'eu' }`).
`serializePartition` turns that record into a canonical, order-stable
string suitable for use as part of an IndexedDB key, a hash bucket, or a
log label.

The function is pure: same input → same output, no allocation hidden
behind a global. It is the only key helper exported from the package
root.

## Usage

```ts
import { serializePartition, type PartitionKey } from '@std-toolkit/cache';

const key: PartitionKey = { tenant: 'acme', region: 'eu' };
serializePartition(key); // 'region:eu#tenant:acme'
```

## API

| Argument    | Type                        | Meaning                                             |
| ----------- | --------------------------- | --------------------------------------------------- |
| `partition` | `PartitionKey \| undefined` | A `Record<string, string>`; absent or empty → `''`. |
| **returns** | `string`                    | `'<k1>:<v1>#<k2>:<v2>#…'`, keys sorted ascendingly. |

`PartitionKey` is just `Record<string, string>`; the alias exists so call
sites read declaratively.

## Examples

### Empty / missing partition

```ts
serializePartition(); // ''
serializePartition({}); // ''
serializePartition(undefined); // ''
```

### Single pair

```ts
serializePartition({ tenant: 'acme' }); // 'tenant:acme'
```

### Order-stable across input order

```ts
const a = serializePartition({ tenant: 'acme', region: 'eu' });
const b = serializePartition({ region: 'eu', tenant: 'acme' });
a === b; // true — keys are sorted before joining
// both === 'region:eu#tenant:acme'
```

### Multi-key, sorted output

```ts
serializePartition({ z: '1', a: '2', m: '3' });
// 'a:2#m:3#z:1'
```

## Edge cases

- **Empty or missing partition → empty string.** Both `undefined` and
  `{}` produce `''`; callers can concatenate the result with a fixed
  prefix and the empty case degrades gracefully.
- **Keys are sorted ASCII-ascending before joining.** Two partitions
  with the same entries but different declaration order produce the
  same string — required for the value to be usable as a stable key.
- **Separator characters are not escaped.** Values containing `':'` or
  `'#'` will round-trip ambiguously. The caller is expected to keep
  partition values free of those characters; the function is intended
  for short tags, not arbitrary blobs.
- **Values are coerced via template-string interpolation.** Because
  `PartitionKey` is typed as `Record<string, string>`, non-string values
  are a type error at the call site; at runtime the function would
  still produce a string, but that behavior is unspecified.
- **The function is pure.** No globals, no allocation outside the
  returned string, no I/O — safe in any Effect or sync context.

## Tests

The suites in `index.test.ts` lock down:

- Empty, `{}`, and `undefined` all map to `''`.
- A single-pair input emits `'<k>:<v>'`.
- Two inputs with the same entries in different orders produce the same
  output.
- Multi-key output is sorted ASCII-ascending by key.

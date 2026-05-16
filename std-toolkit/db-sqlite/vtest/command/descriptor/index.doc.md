---
title: command.descriptor
order: 5
---

# command.descriptor

`SqliteCommand#process({ operation: 'descriptor' })` returns the
`RegistrySchema.descriptors` for every registered _regular_ entity —
each describing the entity's id field, primary index, secondary
indexes, and schema. Useful for RPC clients that need to discover
which queries are valid without holding the entity types.

## Usage

```ts
const res = yield * command.process({ operation: 'descriptor' });
res.descriptors; // StdDescriptor[]
res.timing.durationMs;
```

## API

| Field       | Type                                                        | Meaning                    |
| ----------- | ----------------------------------------------------------- | -------------------------- |
| `operation` | `'descriptor'`                                              | Discriminator.             |
| **returns** | `Effect.Effect<DescriptorResponse, CommandError, SqliteDB>` | `{ descriptors, timing }`. |

## Descriptor shape (one per regular entity)

```ts
{
  name: 'User',
  idField: 'userId',
  version: 'v1',
  primaryIndex: {
    name: 'primary',
    pk: { deps: [...], pattern: 'User#{...}' },
    sk: { deps: ['userId'], pattern: '{userId}' }
  },
  secondaryIndexes: [
    {
      name: 'byEmail',
      pk: { deps: ['email'], pattern: 'User#byEmail#{email}' },
      sk: { deps: ['_u'], pattern: '{_u}' }
    }
  ],
  schema: /* descriptor of the ESchema */
}
```

## Edge cases

- **Descriptors are taken from `registry.getSchema().descriptors`.**
  The command processor does not assemble the descriptor itself.
- **Single-entities are NOT in the descriptor surface.** They have
  no index map; the descriptor only covers regular entities.
- **Each descriptor carries `primaryIndex` + `secondaryIndexes`.**
  Index patterns and field deps are the wire shape RPC clients
  consume.
- **Response carries the standard timing envelope.**

## Tests

Tests live alongside this doc.

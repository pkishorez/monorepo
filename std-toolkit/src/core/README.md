# std-toolkit/core

Shared primitives used across the other std-toolkit modules.

## Subpath

```ts
import {
  EntitySchema,
  MetaSchema,
  Broadcaster,
  StdToolkitError,
} from 'std-toolkit/core';
```

## Exports

| Export                            | Description                                        |
| --------------------------------- | -------------------------------------------------- |
| `EntitySchema`                    | Effect Schema for a keyed entity row               |
| `SingleEntitySchema`              | Effect Schema for a singleton entity row           |
| `MetaSchema`                      | Structural guard schema shared by all table shapes |
| `EntityType` / `SingleEntityType` | Type aliases for entity shapes                     |
| `Broadcaster`                     | Pub/sub primitive for distributing change events   |
| `StdToolkitError`                 | Base error type for the toolkit                    |

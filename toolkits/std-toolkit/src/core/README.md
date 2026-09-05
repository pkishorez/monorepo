# std-toolkit/core

Shared primitives used across the other std-toolkit modules.

## Subpath

```ts
import {
  EntitySchema,
  EntityMetaSchema,
  Broadcaster,
  StdToolkitError,
} from 'std-toolkit/core';
```

## Exports

| Export                                  | Description                                                  |
| --------------------------------------- | ------------------------------------------------------------ |
| `EntitySchema` / `SingleEntitySchema`   | Full entity codecs: encoded envelope ↔ latest decoded entity |
| `EntityMetaSchema`                      | Metadata schema; version belongs to the encoded value        |
| `DecodedEntity` / `DecodedSingleEntity` | Application-facing entity shapes without `_v`                |
| `EncodedEntity` / `EncodedSingleEntity` | Persistence and transport shapes whose value contains `_v`   |
| `Broadcaster`                           | Outbound hook for confirmed decoded entity writes            |
| `StdToolkitError`                       | Base error type for the toolkit                              |

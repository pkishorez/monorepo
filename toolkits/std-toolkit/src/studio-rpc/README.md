# std-toolkit/studio-rpc

One generic, read-only Effect RPC group that exposes a single StdTable to a Studio client.

## Big picture

A Studio client discovers a table from its snapshot at runtime, so applications never generate table-specific RPC contracts. The group delegates entity lookup and access-pattern queries to the table's existing entity surfaces, preserving their defaults, read migration, tombstone visibility, ordering, and pagination. Results are re-encoded as `EncodedEntity` values for transport. Physical storage and adapter-native operations stay hidden. The term is defined in [db/CONTEXT.md](../db/CONTEXT.md); the transport decision is [ADR 0009](../../docs/adr/0009-studio-rpc-entity-semantics-encoded-transport.md).

Snapshots expose application schemas and reads expose application data. Studio RPC configures no authentication, authorization, TLS, or CORS. The host must secure the endpoint as sensitive developer tooling.

## Install

See the [top README](../../README.md).

## Exports

### `std-toolkit/studio-rpc`

| Export            | What it does                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `StudioRpc`       | RpcGroup with `Studio.GetTableSnapshot`, `Studio.GetEntity`, and `Studio.QueryEntities`. |
| `StudioRpc.layer` | Builds the handler Layer for one StdTable; requires that table's adapter layer.          |

## Usage

### Host Studio RPC beside the application's own RPC group

Merge the group into the one the application already serves and provide its handlers with the same adapter layer the application uses.

```ts
import { Layer } from 'effect';
import { StudioRpc } from 'std-toolkit/studio-rpc';

const HostedRpc = ApplicationRpc.merge(StudioRpc);

const HostedHandlers = Layer.mergeAll(
  ApplicationHandlers,
  StudioRpc.layer(table),
).pipe(Layer.provide(adapterTable.layer));
```

- The host chooses the Effect RPC server transport. The Studio connector treats its configured URL as an Effect RPC HTTP endpoint.
- `Studio.GetEntity` takes `{ entity, key }` for keyed entities and `{ entity }` for singletons. A missing keyed entity returns `null`; a missing singleton returns its declared default.
- `Studio.QueryEntities` takes `{ entity, accessPattern, pk, sk?, limit?, after? }`. Sort operators are `=`, `<`, `<=`, `>`, `>=`, `between`, and `beginsWith`. Omit `sk` to read the whole item collection. `limit` defaults to 100 and must be 1 to 100. `<` and `<=` read in descending order. When `hasMore` is true, pass the last entity as `after`.

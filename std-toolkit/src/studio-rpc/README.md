# Studio RPC

`std-toolkit/studio-rpc` exposes one generic, read-only Effect RPC group for a
single StdTable. A Studio client discovers the table from its snapshot at
runtime; applications do not generate table-specific RPC contracts.

## Server

Merge `StudioRpc` into the RPC group already hosted by the application, and
provide its handlers with the same adapter layer that provides the table to
application code:

```ts
import { Layer } from 'effect';
import { StudioRpc } from 'std-toolkit/studio-rpc';

const HostedRpc = ApplicationRpc.merge(StudioRpc);

const HostedHandlers = Layer.mergeAll(
  ApplicationHandlers,
  StudioRpc.layer(table),
).pipe(Layer.provide(adapterTable.layer));
```

The group contributes these procedure tags:

- `Studio.GetTableSnapshot`
- `Studio.GetEntity`
- `Studio.QueryEntities`

The host chooses and configures the Effect RPC server transport. The Studio
connector treats its configured URL as an Effect RPC HTTP endpoint; that URL is
used exactly as supplied.

## Entity lookup

Keyed Entities require their semantic key. Singleton Entities omit it:

```ts
yield *
  client['Studio.GetEntity']({
    entity: 'Note',
    key: { notebook: 'work', noteId: 'n1' },
  });

yield * client['Studio.GetEntity']({ entity: 'Settings' });
```

The operation preserves the existing Entity surface. A missing keyed Entity
returns `null`; a missing singleton returns its declared default. Results are
encoded through the live Entity schema before crossing the RPC boundary.

## Queries

Queries name the Entity and one semantic access pattern discovered from the
table snapshot:

```ts
yield *
  client['Studio.QueryEntities']({
    entity: 'Note',
    accessPattern: 'byStatus',
    pk: { notebook: 'work' },
    sk: {
      operator: 'beginsWith',
      value: { status: 'open', title: 'draft-' },
    },
    limit: 50,
  });
```

Supported sort operators are `=`, `<`, `<=`, `>`, `>=`, `between`, and
`beginsWith`. Omit `sk` to read the whole item collection. Limits default to
100 and must be between 1 and 100. Ordered comparisons accept `null` as their
existing unbounded endpoint; `<` and `<=` read in descending order. Tombstones
remain visible. When `hasMore` is true, pass the last returned Entity as `after`
to resume.

## Security

Snapshots expose application schemas and reads expose application data. Studio
RPC does not configure authentication, authorization, TLS, or CORS; the hosting
application must secure the endpoint as sensitive developer tooling.

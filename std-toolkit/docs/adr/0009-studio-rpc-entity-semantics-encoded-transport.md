# Studio RPC exposes Entity semantics through encoded transport

`std-toolkit/studio-rpc` exposes one generic, read-only Effect RPC group for one runtime-bound StdTable. `Studio.GetTableSnapshot`, `Studio.GetEntity`, and `Studio.QueryEntities` discover the table at runtime and delegate reads to its existing keyed and singleton Entity surfaces, then encode their results as `EncodedEntity` or `EncodedSingleEntity` values for reliable transport; the separately hosted Studio can therefore use one shared client contract without generated application types.

## Considered Options

- **Expose physical `EncodedItem` reads.** Rejected because storage reads do not preserve Entity behavior such as singleton defaults and read migration.
- **Return arbitrary decoded values.** Rejected because one generic RPC schema cannot reliably serialize application-specific decoded types.
- **Generate a table-specific RPC contract.** Rejected because Studio must connect using only a hosted URL and discover entities, schemas, and access patterns from the table snapshot at runtime.

## Consequences

The group is transport-neutral, uses `Studio.`-prefixed procedure tags so a host can merge it with unrelated RPCs, and provides a handler layer that takes a StdTable and requires that table's existing adapter-supplied service. Studio's first connector treats its configured URL as an Effect RPC HTTP endpoint. Queries address semantic entity access patterns rather than physical LSI/GSI slots, preserve existing operators, ordering, tombstone visibility, pagination, and limits, and expose neither writes nor consistency controls; authentication, TLS, and CORS remain the host application's responsibility.

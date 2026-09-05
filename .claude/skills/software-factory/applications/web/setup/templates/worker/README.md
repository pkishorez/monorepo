# Normal Worker

Overlay `src/` on the common app files.

Wrap the root route's children with `RpcProvider` from `routes/internal/rpc-provider`.

The homepage calls `Hello` through `/rpc`, hosted by the same Worker as TanStack Start.

The RPC module defines a `ManagedRuntime` containing the client and HTTP transport layers. The root provider acquires it through `useComponentLifecycle` from `use-effect-ts` and disposes it on unmount. Route effects reuse its cached context for every call.

Keep shared definitions and handlers separate so browser imports stay safe.

Use HTTP requests and polling when adding client synchronization later.

Add the selected database provider at the server boundary using the storage template.

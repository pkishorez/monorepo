# Durable Object with hibernating WebSocket RPC

Overlay this folder's application files on `common/`; omit this README. The overlay includes the greeting contract and handlers, homepage, root provider, client lifecycle, environment type, and Laymos configuration. No Worker-template assembly is needed.

The Alchemy entry provisions the website and RPC Worker and supplies `VITE_RPC_URL`. The RPC module defines a `ManagedRuntime` containing the RPC client and transport layers. The root provider acquires it through `useComponentLifecycle` from `use-effect-ts` and disposes it on unmount. Route effects use its cached context; they do not create or close connections. Keep the common TanStack server entry.

For DO SQLite, apply [the SQLite overlay](../storage/durable-object-sqlite/) last. It supplies the empty table, storage initialization, handler layer, and matching Laymos configuration. Keep business entities for modeling after setup.

For other storage, follow [storage](../storage/README.md). Discover server configuration through `init`; supply runtime services through the handler factory.

`DurableRpcWorker` owns socket upgrades, hibernation, and message/close callbacks. Reuse this RPC group and transport for future methods. For pushed subscriptions, use RPC toolkit's `keepSubscribed`; design replay and durable delivery during modeling and sync.

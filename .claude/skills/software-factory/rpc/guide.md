# RPC

Start by describing the API with RPC toolkit groups: what each call accepts, what it returns, and which errors it can report. A subscription describes the updates it sends over time.

`shared/rpc` holds groups that both server and client can use. It can also provide handlers that call shared operations. Export definitions separately from handlers so a client can import the API without importing its implementation.

`server/rpc` adds server-specific groups and handlers. Its handlers call server operations. It can combine shared groups and handlers with its own, and `server/entry.ts` supplies the services and hosts the API.

`client/rpc` creates the RPC client from the shared and server group definitions. Server definitions must have a browser-safe export that does not pull in server handlers or services. Client sync uses this RPC client to send requests and receive updates.

Use the installed RPC toolkit APIs and check that the definitions, handlers, and client agree. See [the architecture conventions](../architecture.md) for the boundaries.

For RPC authentication guards and authorization policies, read [auth-toolkit Usage](../../auth-toolkit/usage/guide.md).

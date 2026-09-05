# RPC

Define each call’s input, result, and errors with RPC toolkit groups; define emitted updates for subscriptions.

Use [shared architecture](../architecture.md) for boundaries and the installed toolkit APIs for implementation.

Put shared groups in `shared/rpc`, with portable handlers that call shared operations.

Export definitions separately so clients can import them without handlers or services.

Add server groups and handlers in `server/rpc`, calling server operations and composing shared groups as needed.

Supply services and host the API in `server/entry.ts`.

Create the client in `client/rpc` from shared and server definitions safe for the client runtime.

Use that client for sync requests and updates.

Follow [auth-toolkit usage](../../../auth-toolkit/usage/guide.md) for authentication guards and permission policies.

Check that definitions, handlers, and the client agree.

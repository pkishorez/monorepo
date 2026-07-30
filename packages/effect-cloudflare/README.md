# @pkishorez/effect-cloudflare

Effect building blocks for running RPC over Cloudflare Durable Object WebSockets.

Cloudflare lets a Durable Object **hibernate** while its sockets stay open at the edge —
you stop paying for idle connections, and the client never notices. The catch is that
your server-side fibers are destroyed while the socket lives on, so anything long-running
(a stream subscription) is silently orphaned.

This package is the two halves of putting that back together:

| Module                                                       | Runs           | What it does                                                                                                                                      |
| ------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`hibernating-rpc`](src/hibernating-rpc/README.md)           | Durable Object | An Effect `RpcServer` over hibernatable WebSockets. Persists in-flight stream state on the socket so handlers are replayed when the object wakes. |
| [`websocket-rpc-client`](src/websocket-rpc-client/README.md) | Browser        | The `RpcClient` protocol over a WebSocket, plus connection tracking — re-subscribes your streams after every reconnect.                           |

They are usable independently: the server works with any Effect RPC client, and the
client works against any Effect RPC server over a socket.

```ts
// Durable Object
import { makeHibernatingWebSocketRpc } from '@pkishorez/effect-cloudflare/hibernating-rpc';

// browser
import { layerWebSocketProtocol } from '@pkishorez/effect-cloudflare/websocket-rpc-client';
```

## Install

`effect` is the only peer dependency, and must resolve to a **single copy** shared with
your app — this package passes `Context` tags across the boundary, and duplicate
instances produce missing-service errors at runtime that typecheck perfectly.

```jsonc
{
  "dependencies": {
    "@pkishorez/effect-cloudflare": "workspace:*",
    "effect": "catalog:",
  },
}
```

Alchemy is **not** a dependency. `hibernating-rpc` talks to structural ports that
`alchemy/Cloudflare` satisfies as-is, with an adapter for raw workerd — see its
[README](src/hibernating-rpc/README.md#install).

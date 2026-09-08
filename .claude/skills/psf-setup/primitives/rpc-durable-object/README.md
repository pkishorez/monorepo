# RPC Durable Object

Effect RPC served by a Durable Object over a hibernating WebSocket at `/ws/__NAME__`, using RPC toolkit's `makeHibernatingWebSocketRpc` on a raw workerd `DurableObject`. The Website Worker hosts the class and forwards `/ws/__NAME__` to a single instance. Pick this when the app needs server push, subscriptions, or per-object state.

Requires `application`. Composes with `rpc-worker` and other `rpc-durable-object` instances; each instance has its own name, class, binding, and pathname (see the application README, "Composing hosts"). Storage lives with the object: pair with `storage-do-sqlite` for local state.

## Files

Adds:

- `src/shared/rpc/greeting/` and `src/shared/rpc/greeting-handlers/`: definition and portable handlers. Skip if another instance already added them.
- `src/server/durable-objects/__NAME__.ts`: `__Name__Object`, builds the RPC server once per activation in `blockConcurrencyWhile` and wires `fetch`, `webSocketMessage`, `webSocketClose`.
- `src/client/rpc/__NAME__/`: the `__Name__Rpc` service and `make__Name__RpcRuntime`, a `ManagedRuntime` owning the client and WebSocket transport.
- `src/routes/internal/__NAME__-rpc-provider.tsx`: connects to `/ws/__NAME__` on the page origin and exposes the runtime through `use__Name__Rpc`.
- `infra/website.snippet.ts`: the `env` entry to merge into `infra/website.ts`.

Replaces:

- `src/routes/page.tsx`: calls `Hello` and renders it with a Refresh button. Only the first RPC instance replaces it; later instances add a `<Greeting>`.

## Seams

- `infra/website.ts`: add `__NAME_ENV___RPC: Cloudflare.DurableObject('__Name__Object')` under `env`.
- `src/server.ts`: re-export the class and add the case before `default`:

  ```ts
  export { __Name__Object } from './server/durable-objects/__NAME__.ts';
  // ...
  case '/ws/__NAME__':
    return env.__NAME_ENV___RPC.getByName('singleton').fetch(request);
  ```

- `src/routes/__root.tsx`: wrap `{children}` with `__Name__RpcProvider` from `./internal/__NAME__-rpc-provider`.
- `package.json`: add `rpc-toolkit: workspace:*` and `use-effect-ts: workspace:*` to dependencies.

## Laymos

Add layers once (skip those that exist):

| Layer                    | Paths                              | Exposed modules                          |
| ------------------------ | ---------------------------------- | ---------------------------------------- |
| `shared-rpc-definitions` | `src/shared/rpc/greeting`          | `src/shared/rpc/greeting`                |
| `shared-rpc-handlers`    | `src/shared/rpc/greeting-handlers` | `src/shared/rpc/greeting-handlers`       |
| `server-rpc`             | `src/server`                       | `src/server/durable-objects/__NAME__.ts` |
| `client-rpc`             | `src/client/rpc`                   | `src/client/rpc/__NAME__`                |

Per instance, add `src/server/durable-objects/__NAME__.ts` to `server-rpc` and `src/client/rpc/__NAME__` to `client-rpc` as exposed modules, and `src/routes/internal/__NAME__-rpc-provider.tsx` to `routes` as `{ "shared": true }`.

Add rules once: `server-entry` uses `server-rpc`; `server-rpc` uses `infra`, `shared-rpc-handlers`, `shared-rpc-definitions`; `shared-rpc-handlers` uses `shared-rpc-definitions`, `domain`; `client-rpc` uses `shared-rpc-definitions`; `routes` uses `client-rpc`.

## Growing it

New groups merge into `group` in `src/server/durable-objects/__NAME__.ts` and the client in `src/client/rpc/__NAME__/rpc.ts`. Runtime services are provided to the handler layer in `#boot`; server-only configuration is read from `env` in the constructor. For pushed updates use RPC toolkit's `keepSubscribed`. Another instance: repeat this README with a new name.

## Verify

The home page shows "Hello from <title>!" after load and after Refresh, and the browser keeps one open WebSocket per instance at `/ws/__NAME__`. The built `dist/server/server.js` exports `__Name__Object`.

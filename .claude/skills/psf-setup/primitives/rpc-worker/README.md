# RPC worker

Effect RPC hosted inside the Website Worker over HTTP at `/rpc/__NAME__`. Pick this when the app needs a backend and does not need server push; add client sync later with polling.

Requires `application`. Composes with `rpc-durable-object` and other `rpc-worker` instances; each instance has its own name and pathname (see the application README, "Composing hosts").

## Files

Adds:

- `src/shared/rpc/greeting/`: the `Greeting` group definition, importable by the browser. Skip if another instance already added it.
- `src/shared/rpc/greeting-handlers/`: portable handlers calling the domain. Skip if already present.
- `src/server/rpc/__NAME__/entry.ts`: `handle__Name__Rpc`, the HTTP host for this instance's groups.
- `src/client/rpc/__NAME__/`: the `__Name__Rpc` service and `make__Name__RpcRuntime`, a `ManagedRuntime` owning the client and HTTP transport.
- `src/routes/internal/__NAME__-rpc-provider.tsx`: acquires the runtime for the session at `/rpc/__NAME__` and exposes it through `use__Name__Rpc`.

Replaces:

- `src/routes/page.tsx`: calls `Hello` and renders it with a Refresh button. Only the first RPC instance replaces it; later instances add a `<Greeting>`.

## Seams

- `src/server.ts`: add the case before `default`:

  ```ts
  case '/rpc/__NAME__':
    return handle__Name__Rpc(request);
  ```

- `src/routes/__root.tsx`: wrap `{children}` with `__Name__RpcProvider` from `./internal/__NAME__-rpc-provider`.
- `package.json`: add `use-effect-ts: workspace:*` to dependencies.

## Laymos

Add layers once (skip those that exist):

| Layer                    | Paths                              | Exposed modules                    |
| ------------------------ | ---------------------------------- | ---------------------------------- |
| `shared-rpc-definitions` | `src/shared/rpc/greeting`          | `src/shared/rpc/greeting`          |
| `shared-rpc-handlers`    | `src/shared/rpc/greeting-handlers` | `src/shared/rpc/greeting-handlers` |
| `server-rpc`             | `src/server`                       | `src/server/rpc/__NAME__`          |
| `client-rpc`             | `src/client/rpc`                   | `src/client/rpc/__NAME__`          |

Per instance, add `src/server/rpc/__NAME__` to `server-rpc` and `src/client/rpc/__NAME__` to `client-rpc` as exposed modules, and `src/routes/internal/__NAME__-rpc-provider.tsx` to `routes` as `{ "shared": true }`.

Add rules once: `server-entry` uses `server-rpc`; `server-rpc` uses `shared-rpc-handlers`, `shared-rpc-definitions`; `shared-rpc-handlers` uses `shared-rpc-definitions`, `domain`; `client-rpc` uses `shared-rpc-definitions`; `routes` uses `client-rpc`.

## Growing it

New groups go in `src/shared/rpc/<group>/` with handlers in `src/shared/rpc/<group>-handlers/`; merge them in this instance's `entry.ts` and `rpc.ts`. Handlers that need server-only services move to `src/server/rpc/__NAME__/`. Another instance: repeat this README with a new name.

## Verify

The home page shows "Hello from <title>!" after load and after Refresh. `curl -X POST <local-url>/rpc/__NAME__` returns an RPC error rather than a 404.

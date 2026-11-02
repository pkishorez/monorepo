# @kestack/rpc-toolkit

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @kestack/std-toolkit@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [[`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed)]:
  - @kestack/std-toolkit@0.0.6

## 0.0.5

### Patch Changes

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`6a64461`](https://github.com/pkishorez/monorepo/commit/6a6446178baa61df7df5cc1b8272ae56e38c962c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The websocket `client` takes `watch`, told of each socket's first frame and how it closed. `SocketWatch` and `SocketClose` are exported.
- Updated dependencies [[`8b4ff10`](https://github.com/pkishorez/monorepo/commit/8b4ff102bf78eb9bf94125e59b9657baafe0f19e)]:
  - @kestack/std-toolkit@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @kestack/std-toolkit@0.0.4

## 0.0.3

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - - Breaking: each Transport is its own door (`rpc/http`, `rpc/websocket`, `rpc/in-process`, `http-api`); the `Rpc` and `HttpApi` namespaces are gone.
  - `onExit` lets a Client Implementation see how a call ended.
  - The websocket `client` takes `protocols`.
- Updated dependencies [[`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1)]:
  - @kestack/std-toolkit@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @kestack/std-toolkit@0.0.2

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: three entry points, `rpc`, `http-api` and `alchemy`, replace the old ones (`rpc/cannotation`, `http/cannotation`, `rpc/invocation`, `rpc/websocket-client`, `rpc/cloudflare/*`). The Cannotation is now Middleware (`Rpc.middleware`, `HttpApi.middleware`). `Rpc` has three Transports, each a client and server pair: `http`, `websocket` and the new `inProcess`, which calls the handlers in the same process.

  The websocket server can keep stream state in the Durable Object's SQLite (`Rpc.websocket.streams.sqlite`) instead of the 2 KB socket attachment, closes a socket whose saved state is lost with `RESUME_LOST` so the client resubscribes, and its client `url` may be an Effect run before every connect. `@kestack/std-toolkit` is now a required peer. Needs Effect `^4.0.0`.

- Updated dependencies [[`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9)]:
  - @kestack/std-toolkit@0.0.1

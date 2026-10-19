# @kestack/rpc-toolkit

## 0.0.3

### Patch Changes

- [#71](https://github.com/pkishorez/monorepo/pull/71) [`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Client Implementation can now react to how a call ended: `next(request).pipe(Rpc.onExit((exit) => ...))` runs the observer with the call's decoded Exit before the caller sees it, over the http, websocket and inProcess Transports alike. The `Rpc.http` client also honours `FetchHttpClient.RequestInit` given around `next`, so a Client Implementation can set fetch options such as `credentials` for the calls it signs.
- Updated dependencies []:
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

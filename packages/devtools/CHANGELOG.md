# @kishorez/devtools

## 0.0.3

### Patch Changes

- fix: apply CORS headers to every response, not just the preflight

  The CORS middleware was passed to `HttpRouter.serve`'s `middleware` option,
  which runs around response sending — its header changes never reached real
  responses, so actual requests came back without `Access-Control-Allow-Origin`
  even though preflights were answered. CORS is now a global router middleware
  that wraps each route handler before the response is sent, stamping
  `Access-Control-Allow-Origin`, the allowed methods, and
  `Access-Control-Allow-Private-Network: true` onto every response and the 204
  preflight.

## 0.0.2

### Patch Changes

- fix: send Access-Control-Allow-Private-Network header for localhost preflights

  The hosted frontend is served over HTTPS from a public origin, so browsers
  issue a Private Network Access preflight when it calls the loopback devtools
  server. The plain CORS middleware doesn't answer that preflight, so requests
  were blocked with a CORS error (only when using the published package — local
  `pnpm dev` proxies the calls same-origin and never hits it). Stamp
  `Access-Control-Allow-Private-Network: true` onto responses so the preflight
  succeeds.

## 0.0.1

### Patch Changes

- [`2a05d0a`](https://github.com/pkishorez/monorepo/commit/2a05d0aadf718192038336c960338e6584475a05) Thanks [@pkishorez](https://github.com/pkishorez)! - Initial release.
  - **depcruise-viz**: dependency-graph visualizer built on dependency-cruiser output.
  - **@kishorez/devtools**: local devtools RPC server for inspecting a project's dependency graph.
  - **@kishorez/lotel**: local OpenTelemetry server for development (internal/private — versioned but not published to npm).

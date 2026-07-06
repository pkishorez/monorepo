# @kishorez/devtools

## 0.0.9

### Patch Changes

- [`b6c8daf`](https://github.com/pkishorez/monorepo/commit/b6c8daf6814a806303062deafeb290fe830c30e7) Thanks [@pkishorez](https://github.com/pkishorez)! - Improve speed, by spawning a sub process for cruise. Add 2 more sub commands for depcruise-lint. Improve ui.

- Updated dependencies [[`b6c8daf`](https://github.com/pkishorez/monorepo/commit/b6c8daf6814a806303062deafeb290fe830c30e7)]:
  - depcruise-viz@0.0.9
  - std-toolkit@0.0.1

## 0.0.8

### Patch Changes

- [`a95b573`](https://github.com/pkishorez/monorepo/commit/a95b57378f567b3d990e68127ea55e5a4967853e) Thanks [@pkishorez](https://github.com/pkishorez)! - Big rewrite! Now, layers are more like a graph. Not stacks. No more features. Just modules. Added ability to configure rules at module level. And complete overhaul of the frontend viz!

- Updated dependencies [[`a95b573`](https://github.com/pkishorez/monorepo/commit/a95b57378f567b3d990e68127ea55e5a4967853e)]:
  - depcruise-viz@0.0.8
  - std-toolkit@0.0.1

## 0.0.7

### Patch Changes

- [`5b9a4ab`](https://github.com/pkishorez/monorepo/commit/5b9a4abf8a6250e7005d1b5df7abed584e59624d) Thanks [@pkishorez](https://github.com/pkishorez)! - Improve ui. For devtools, only open when --open flag is present.

- Updated dependencies [[`5b9a4ab`](https://github.com/pkishorez/monorepo/commit/5b9a4abf8a6250e7005d1b5df7abed584e59624d)]:
  - depcruise-viz@0.0.7
  - std-toolkit@0.0.1

## 0.0.6

### Patch Changes

- Improve ui. Fix edge logic.

- Updated dependencies []:
  - depcruise-viz@0.0.6
  - std-toolkit@0.0.1

## 0.0.5

### Patch Changes

- Rebuild the feature model so selecting any feature renders a single-rooted, top-down cone derived from the real import graph, instead of an inferred pile of disconnected roots.

- Updated dependencies []:
  - depcruise-viz@0.0.5
  - @kishorez/lotel@0.0.1
  - std-toolkit@0.0.1

## 0.0.4

### Patch Changes

- Bundle typescript as well, for depcruise to work properly. Fix ui for frontend.

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

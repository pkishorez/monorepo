# @kishorez/devtools

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

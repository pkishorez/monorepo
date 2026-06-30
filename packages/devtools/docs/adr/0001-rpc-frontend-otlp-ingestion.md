# DevTools serves an RPC frontend and OTLP/HTTP ingestion from one host

**Status:** accepted

DevTools is the single backend process for all local dev tooling. We deliberately
run **two surfaces on one HTTP server**: an Effect **RPC** surface at `/rpc` that
the `/devtools` route is the sole consumer of (depcruise + telemetry reads), and
a plain **OTLP/HTTP** surface at `/v1/*` for telemetry ingestion. We mount
lotel's ingest group for `/v1/*` and call lotel's orchestration + storage from
the RPC read handlers; lotel keeps its logic but no longer runs its own process.

The split exists because OTLP is a fixed wire protocol — external OpenTelemetry
exporters cannot speak Effect RPC, so ingestion _must_ be HTTP, while the
frontend benefits from RPC's typed client. A future reader seeing two transports
on one server would otherwise assume it was an oversight.

## Considered options

- **Unify everything on HTTP (one HttpApi).** Rejected: gives up the typed RPC
  client ergonomics the frontend already uses, for no gain on the ingestion side.
- **Unify everything on RPC.** Impossible for ingestion: external OTLP exporters
  can't speak it.
- **Keep lotel as a separate running server.** Rejected: defeats the umbrella —
  the frontend would need two URLs and two clients.

## Consequences

- DevTools provides lotel's `Db` layer to both the RPC read handlers and the
  mounted ingest group. Because DevTools is published, lotel + std-toolkit are
  **bundled into the server artifact at build** (devDependencies +
  `alwaysBundle`) rather than declared as runtime deps; `node:sqlite` keeps the
  bundle native-dependency-free.
- lotel's own HTTP **query** endpoints (`/api/*`) become redundant (reads go via
  RPC); only its `/v1/*` ingest endpoints are mounted.
- Telemetry read procedures must re-declare RPC success schemas matching lotel's
  stored record shapes.

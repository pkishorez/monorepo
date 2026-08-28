# DevTools serves Effect RPC and OTLP/HTTP from one host

**Status:** accepted

DevTools runs one server with two transport surfaces. Its frontend uses Effect
RPC at `/rpc`; instrumented applications use OTLP/HTTP JSON at `/v1/traces` and
`/v1/logs`. DevTools composes lotel's RPC contract with its other Tool contracts
and mounts lotel's OTLP/HTTP group. lotel supplies contracts and handler layers
but does not own a server or CLI.

The split is required because OpenTelemetry exporters cannot use Effect RPC,
while the frontend benefits from a typed RPC contract. OTLP/gRPC, OTLP/HTTP
protobuf, and metrics are outside the current scope.

## Considered options

- **Use Effect RPC for all traffic.** Rejected because OpenTelemetry exporters
  require OTLP.
- **Use plain HTTP for the frontend.** Rejected because it gives up the shared
  typed RPC contract without simplifying ingestion.
- **Run lotel as a separate server.** Rejected because DevTools is the single
  host for its Tools.

## Consequences

- DevTools owns server configuration, CORS, process lifecycle, storage-path
  selection, RPC composition, and route mounting.
- Browser RPC access is same-origin. Cross-origin and Private Network Access
  headers apply only to OTLP ingestion so locally running browser applications
  can export telemetry to Lotel.
- UI and RPC requests validate their loopback `Host` and browser `Origin` to
  prevent unrelated webpages and DNS-rebinding hosts from invoking local file
  analysis or Story execution. Non-browser clients without an `Origin` remain
  supported.
- lotel exports `LotelRpc`, its RPC handler layer, its OTLP/HTTP group, its
  OTLP/HTTP handler layer, and named Telemetry Store adapter layers.
- DevTools does not redefine telemetry schemas or call lotel storage directly.

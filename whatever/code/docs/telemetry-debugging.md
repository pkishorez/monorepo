# Telemetry debugging

The code server sends OTLP/HTTP JSON traces, logs, and metrics to
`http://localhost:14400` by default. Override it with `--telemetry-url` or
`WHATEVER_TELEMETRY_URL`.

## Inspect a run

1. Check that `http://localhost:14400/api/traces` responds.
2. Start a thread or run through the normal RPC client.
3. Find the run ID in `/api/traces` or `/api/logs`.
4. Follow `code.run.start` or `code.thread.start` into `code.run.execute`, then
   inspect `code.run.complete` for terminal persistence.
5. Use the shared trace and span IDs to match structured logs to spans.

The telemetry intentionally excludes prompts, response chunks, session IDs,
Git URLs, and working-directory paths.

## Read the last signal

- No telemetry: check the configured endpoint and that the telemetry layer
  wraps the server runtime.
- Start without execute: inspect validation, the busy-thread check, and the
  initial database transaction.
- Execute without finish: inspect the harness process or interruption path.
- `code.run.outcome_persistence_failed`: the harness ended, but its terminal
  database transaction failed.
- Completed persistence with stale client state: inspect RPC streaming and
  client synchronization.

Use `/api/metrics` to compare run counts, duration, terminal status,
interruptions, and persistence failures by harness.
